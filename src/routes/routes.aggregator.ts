import { Injectable, Logger } from '@nestjs/common';
import { ProviderUnavailableError } from '../common/errors/domain.errors';
import { ProvidersRegistry } from '../providers/providers.registry';
import { Route } from './route.dto';
import { mergeRoutes } from './route.merge';
import { parseProviderResponse } from './route.parser';

// TODO(prod): wrap the merged result in a short-TTL cache once we
// outgrow the PoC. Skipped here — no point hand-rolling one without an
// invalidation strategy.
@Injectable()
export class RoutesAggregator {
  private readonly logger = new Logger(RoutesAggregator.name);

  constructor(private readonly providers: ProvidersRegistry) {}

  async getAll(): Promise<Route[]> {
    const adapters = this.providers.list();
    const settled = await Promise.allSettled(adapters.map((a) => a.fetch()));

    const successful: Route[][] = [];
    const failed: string[] = [];

    for (let i = 0; i < settled.length; i++) {
      const adapter = adapters[i];
      const result = settled[i];

      if (result.status === 'rejected') {
        // Adapter already logged the cause; we just track the name for
        // the partial-failure summary.
        failed.push(adapter.name);
        continue;
      }

      try {
        const routes = parseProviderResponse(adapter.name, result.value);
        successful.push(routes);
      } catch (err) {
        // Whole-body parse failure. Logged here so it shows up next to
        // adapter-level failures in one place.
        failed.push(adapter.name);
        this.logger.warn(`provider=${adapter.name} parse_failed reason=${(err as Error).message}`);
      }
    }

    if (successful.length === 0) {
      // Don't return [] with 200 — that hides a hard failure as "no
      // flights available". 502 is the honest answer.
      throw new ProviderUnavailableError('all-providers');
    }

    if (failed.length > 0) {
      this.logger.warn(`partial=true ok=${successful.length} failed=[${failed.join(',')}]`);
    }

    return mergeRoutes(successful);
  }
}
