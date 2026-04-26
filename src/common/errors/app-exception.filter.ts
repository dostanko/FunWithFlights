import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ProviderParseError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from './domain.errors';

interface ErrorBody {
  code: string;
  message: string;
  requestId?: string;
  timestamp: string;
}

/**
 * Global exception filter.
 *
 * Maps domain errors and `HttpException`s to a consistent JSON envelope:
 *
 *   { code, message, requestId, timestamp }
 *
 * Mapping:
 *   - `ProviderTimeoutError`     → 504  PROVIDER_TIMEOUT
 *   - `ProviderUnavailableError` → 502  PROVIDER_UNAVAILABLE
 *   - `ProviderParseError`       → 502  PROVIDER_PARSE_ERROR
 *   - `HttpException`            → its own status, code = `HTTP_<status>`
 *   - anything else              → 500  INTERNAL_ERROR
 *
 * 5xx is logged at `error` (with the full exception attached for stack
 * traces), 4xx at `warn`. The `requestId` comes from `pino-http`'s
 * `genReqId`, so the same id appears on the access log line, the error
 * log line, and the response body — one-shot grep across all three.
 */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    const requestId = req.id;

    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';

    if (exception instanceof ProviderTimeoutError) {
      status = 504;
      code = 'PROVIDER_TIMEOUT';
      message = exception.message;
    } else if (exception instanceof ProviderUnavailableError) {
      status = 502;
      code = 'PROVIDER_UNAVAILABLE';
      message = exception.message;
    } else if (exception instanceof ProviderParseError) {
      status = 502;
      code = 'PROVIDER_PARSE_ERROR';
      message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = `HTTP_${status}`;
      const r = exception.getResponse();
      if (typeof r === 'string') {
        message = r;
      } else if (r && typeof r === 'object') {
        const maybeMessage = (r as { message?: unknown }).message;
        if (typeof maybeMessage === 'string') {
          message = maybeMessage;
        } else if (Array.isArray(maybeMessage)) {
          message = maybeMessage.join('; ');
        } else {
          message = exception.message;
        }
      } else {
        message = exception.message;
      }
    }

    if (status >= 500) {
      this.logger.error({ status, code, err: exception, requestId }, message);
    } else {
      this.logger.warn({ status, code, requestId }, message);
    }

    const body: ErrorBody = {
      code,
      message,
      requestId,
      timestamp: new Date().toISOString(),
    };

    res.status(status).json(body);
  }
}
