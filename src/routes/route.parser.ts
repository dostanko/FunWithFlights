import { Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ProviderParseError } from '../common/errors/domain.errors';
import { Route } from './route.dto';

/**
 * Per-provider response parser.
 *
 * Two-tier resilience:
 *   - whole body not an array  → throw ProviderParseError (this provider
 *     is treated as failed for the request)
 *   - one item fails validation → drop it, keep going. A bad row
 *     shouldn't cost us the other 29 999 good ones.
 *
 * Logging: one summary WARN line after we've seen the whole body, with
 * up to {@link MAX_EXAMPLE_ERRORS} representative reasons. Per-record
 * lines would drown CloudWatch on a noisy provider.
 *
 * `equipment` is normalised on the way in:
 *   - string  "E90 320"   → ["E90", "320"]
 *   - missing / null / "" → []
 *   - array               → kept, non-string entries filtered out
 */
const MAX_EXAMPLE_ERRORS = 5;

export function parseProviderResponse(
  providerName: string,
  raw: unknown,
  logger: Logger = new Logger(`RouteParser[${providerName}]`),
): Route[] {
  if (!Array.isArray(raw)) {
    throw new ProviderParseError(providerName);
  }

  const routes: Route[] = [];
  const examples: string[] = [];
  let dropped = 0;

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const normalised = normaliseItem(item);
    const candidate = plainToInstance(Route, normalised);
    const errors = validateSync(candidate, {
      whitelist: false,
      forbidUnknownValues: false,
    });

    if (errors.length > 0) {
      dropped += 1;
      if (examples.length < MAX_EXAMPLE_ERRORS) {
        examples.push(`idx=${i} ${summariseErrors(errors)}`);
      }
      continue;
    }
    routes.push(candidate);
  }

  if (dropped > 0) {
    logger.warn(
      `provider=${providerName} total=${raw.length} valid=${routes.length} dropped=${dropped} examples=[${examples.join(' | ')}]`,
    );
  }

  return routes;
}

function normaliseItem(item: unknown): unknown {
  if (!item || typeof item !== 'object') {
    return item;
  }
  const obj = item as Record<string, unknown>;
  const eq = obj.equipment;

  let equipment: string[];
  if (typeof eq === 'string') {
    equipment = eq.split(/\s+/).filter((s) => s.length > 0);
  } else if (Array.isArray(eq)) {
    equipment = eq.filter((s): s is string => typeof s === 'string' && s.length > 0);
  } else {
    equipment = [];
  }

  return { ...obj, equipment };
}

function summariseErrors(errors: ReturnType<typeof validateSync>): string {
  return errors
    .map((e) => {
      const constraints = Object.values(e.constraints ?? {});
      return `${e.property}=${constraints.join('|') || 'invalid'}`;
    })
    .join(',');
}
