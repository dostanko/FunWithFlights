import { Injectable } from '@nestjs/common';
import { Route } from './route.dto';
import { RouteResponseDto } from './route-response.dto';
import { RoutesAggregator } from './routes.aggregator';
import { RoutesQueryDto } from './routes.query.dto';

/**
 * Thin adapter between the internal aggregator and the public HTTP edge.
 * Mostly collapses internal `equipment: string[]` (kept as an array so the
 * merge can take a real set-union — see `route.merge.ts`) into the
 * space-joined string clients expect.
 *
 * Aggregator errors are not caught here on purpose — they bubble up to
 * `AppExceptionFilter`, which owns the HTTP mapping.
 */
@Injectable()
export class RoutesService {
  constructor(private readonly aggregator: RoutesAggregator) {}

  async getAll(query?: RoutesQueryDto): Promise<RouteResponseDto[]> {
    const routes = await this.aggregator.getAll();
    const filtered = applyFilters(routes, query);
    return filtered.map(toResponse);
  }
}

function applyFilters(routes: Route[], q?: RoutesQueryDto): Route[] {
  if (!q) return routes;
  const { sourceAirport, destinationAirport } = q;
  if (sourceAirport === undefined && destinationAirport === undefined) {
    return routes;
  }
  return routes.filter((r) => {
    if (sourceAirport !== undefined && r.sourceAirport !== sourceAirport) return false;
    if (destinationAirport !== undefined && r.destinationAirport !== destinationAirport)
      return false;
    return true;
  });
}

function toResponse(route: Route): RouteResponseDto {
  return {
    airline: route.airline,
    sourceAirport: route.sourceAirport,
    destinationAirport: route.destinationAirport,
    codeShare: route.codeShare,
    stops: route.stops,
    // Empty array serialises to "", not "[]" or "null".
    equipment: route.equipment.join(' '),
  };
}
