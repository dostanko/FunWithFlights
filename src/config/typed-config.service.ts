import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type NodeEnv = 'development' | 'production' | 'test';
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Typed accessors over `ConfigService`. Consumers should never reach
 * into `ConfigService` with stringly-typed keys — that bypasses the
 * validation guarantees from `env.schema.ts`. Every env read goes
 * through the methods/getters here.
 *
 * `getOrThrow` is used because `validateEnv` has already coerced and
 * defaulted every value; a missing key at runtime would be a
 * programmer error, not a recoverable condition.
 */
@Injectable()
export class TypedConfigService {
  constructor(private readonly cfg: ConfigService) {}

  get port(): number {
    return this.cfg.getOrThrow<number>('PORT');
  }

  get nodeEnv(): NodeEnv {
    return this.cfg.getOrThrow<NodeEnv>('NODE_ENV');
  }

  get logLevel(): LogLevel {
    return this.cfg.getOrThrow<LogLevel>('LOG_LEVEL');
  }

  get httpTimeoutMs(): number {
    return this.cfg.getOrThrow<number>('HTTP_TIMEOUT_MS');
  }

  /**
   * If true, `ProvidersRegistry` fires a fan-out fetch right after
   * registration to warm upstream Lambda containers, so the first real
   * client request hits an already-warm provider.
   */
  get providersWarmup(): boolean {
    return this.cfg.getOrThrow<boolean>('PROVIDERS_WARMUP');
  }

  /**
   * Provider names from the `PROVIDERS` CSV — trimmed, lowercased, in
   * declaration order. Lowercasing makes downstream lookups
   * deterministic: `getProviderUrl('provider1')` →
   * `PROVIDER_PROVIDER1_URL`.
   */
  get providerNames(): string[] {
    return this.cfg
      .getOrThrow<string>('PROVIDERS')
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n.length > 0)
      .map((n) => n.toLowerCase());
  }

  /**
   * Resolve the URL for a given provider name. Throws if missing — but
   * post-validation this should never happen, since `env.schema.ts`
   * guarantees a URL for every name in `PROVIDERS`.
   */
  getProviderUrl(name: string): string {
    return this.cfg.getOrThrow<string>(`PROVIDER_${name.toUpperCase()}_URL`);
  }
}
