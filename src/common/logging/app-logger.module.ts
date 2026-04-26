import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { TypedConfigService } from '../../config/typed-config.service';

/**
 * Wires `nestjs-pino` as the application logger.
 *
 * - **Dev:** pretty, single-line, colorised output via `pino-pretty`.
 * - **Prod / test:** raw JSON to stdout, ready for CloudWatch / log shippers.
 * - **Request id:** if the client sends `x-request-id`, we keep it;
 *   otherwise generate a UUID. Either way it's echoed back in the
 *   response header and attached to every log line for the request —
 *   easy correlation across services and ALB access logs.
 * - **Health-check noise:** `/health` is excluded from auto-logging.
 *   The ALB hits it every ~30 s and would otherwise dominate the stream.
 *
 * `TypedConfigService` comes from the `@Global` `AppConfigModule`, so
 * no explicit `imports` here.
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [TypedConfigService],
      useFactory: (cfg: TypedConfigService) => {
        const isDev = cfg.nodeEnv === 'development';
        return {
          pinoHttp: {
            level: cfg.logLevel,
            transport: isDev
              ? {
                  target: 'pino-pretty',
                  options: {
                    singleLine: true,
                    colorize: true,
                    translateTime: 'SYS:HH:MM:ss.l',
                    ignore: 'pid,hostname,context,req,res,responseTime',
                  },
                }
              : undefined,
            genReqId: (req: IncomingMessage, res: ServerResponse) => {
              const incoming = req.headers['x-request-id'];
              const id = (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            customProps: () => ({ context: 'http' }),
            serializers: {
              req: (req: { id?: string; method?: string; url?: string }) => ({
                id: req.id,
                method: req.method,
                url: req.url,
              }),
              res: (res: { statusCode?: number }) => ({
                statusCode: res.statusCode,
              }),
            },
            // Don't log the routine ALB liveness pings.
            autoLogging: {
              ignore: (req: IncomingMessage) => req.url === '/health',
            },
          },
        };
      },
    }),
  ],
})
export class AppLoggerModule {}
