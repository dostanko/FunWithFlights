import { Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import axios from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  DomainError,
  ProviderParseError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from '../common/errors/domain.errors';

/**
 * Generic HTTP adapter for an upstream flight-routes provider.
 *
 * Transport layer only — returns the parsed JSON body unchanged. Shape
 * enforcement / normalisation lives one layer up (Aggregator).
 *
 * Failure mapping:
 *   - request exceeds `timeoutMs`        → ProviderTimeoutError
 *   - network error / 4xx / 5xx          → ProviderUnavailableError
 *   - body is not a valid JSON object/array → ProviderParseError
 */

const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
  'EPIPE',
  'EPROTO',
]);

type Outcome = 'ok' | 'timeout' | 'unavailable' | 'parse_error';

export class HttpProviderAdapter {
  private readonly logger: Logger;

  constructor(
    public readonly name: string,
    public readonly url: string,
    public readonly timeoutMs: number,
    private readonly http: HttpService,
  ) {
    this.logger = new Logger(`HttpProviderAdapter[${name}]`);
  }

  async fetch(): Promise<unknown> {
    const startedAt = Date.now();
    let response;

    try {
      response = await firstValueFrom(
        this.http.get<string>(this.url, {
          timeout: this.timeoutMs,
          // Keep the raw body — we parse JSON ourselves so a malformed
          // response surfaces as ProviderParseError instead of an opaque
          // axios SyntaxError leaking through the filter.
          transformResponse: [(data: string) => data],
        }),
      );
    } catch (err: unknown) {
      throw this.mapHttpError(err, startedAt);
    }

    const durationMs = Date.now() - startedAt;
    let parsed: unknown;
    try {
      parsed = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    } catch (err: unknown) {
      this.logFailure('parse_error', durationMs, response.status);
      throw new ProviderParseError(this.name, this.sanitizeCause(err));
    }

    if (parsed === null || typeof parsed !== 'object') {
      this.logFailure('parse_error', durationMs, response.status);
      throw new ProviderParseError(this.name);
    }

    this.logSuccess(durationMs, response.status);
    return parsed;
  }

  private mapHttpError(err: unknown, startedAt: number): DomainError {
    const durationMs = Date.now() - startedAt;
    const safeCause = this.sanitizeCause(err);

    if (axios.isAxiosError(err)) {
      const code = err.code;

      if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
        this.logFailure('timeout', durationMs);
        return new ProviderTimeoutError(this.name, this.timeoutMs, safeCause);
      }

      if (code && NETWORK_ERROR_CODES.has(code)) {
        this.logFailure('unavailable', durationMs);
        return new ProviderUnavailableError(this.name, safeCause);
      }

      if (err.response) {
        // Both 4xx and 5xx map to UNAVAILABLE on purpose: a 4xx from an
        // upstream is our config / their drift, never the end-user's
        // fault. Surfacing it as 502 keeps those internals out of
        // client responses.
        this.logFailure('unavailable', durationMs, err.response.status);
        return new ProviderUnavailableError(this.name, safeCause);
      }

      // No response, no recognised code — defensive default.
      this.logFailure('unavailable', durationMs);
      return new ProviderUnavailableError(this.name, safeCause);
    }

    // Non-axios error reaching this branch means a bug in the adapter
    // or in axios itself — log loudly and surface as unavailable.
    this.logger.error(
      `provider=${this.name} outcome=unexpected duration=${durationMs}ms err=${
        (err as Error)?.message ?? String(err)
      }`,
    );
    return new ProviderUnavailableError(this.name, safeCause);
  }

  /**
   * Pull just the useful, serialisable bits out of an axios error.
   *
   * The full axios error object holds the underlying `ClientRequest`
   * and response stream, both with circular references
   * (`_currentRequest`, `_redirectable`) that break JSON serialisation
   * downstream (logs, jest-worker IPC, anything that calls
   * `JSON.stringify(cause)`). It also contains sockets / headers /
   * request bodies we don't want leaking into log lines by accident.
   */
  private sanitizeCause(err: unknown): Record<string, unknown> {
    if (axios.isAxiosError(err)) {
      return {
        name: err.name,
        message: err.message,
        code: err.code,
        status: err.response?.status,
      };
    }
    if (err instanceof Error) {
      return { name: err.name, message: err.message };
    }
    return { value: String(err) };
  }

  private logSuccess(durationMs: number, statusCode: number): void {
    this.logger.log(
      `provider=${this.name} outcome=ok status=${statusCode} duration=${durationMs}ms`,
    );
  }

  private logFailure(
    outcome: Exclude<Outcome, 'ok'>,
    durationMs: number,
    statusCode?: number,
  ): void {
    const status = statusCode !== undefined ? statusCode : '-';
    this.logger.warn(
      `provider=${this.name} outcome=${outcome} status=${status} duration=${durationMs}ms`,
    );
  }
}
