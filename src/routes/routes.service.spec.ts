import { ProviderUnavailableError } from '../common/errors/domain.errors';
import { Route } from './route.dto';
import { RoutesAggregator } from './routes.aggregator';
import { RoutesService } from './routes.service';
import { RoutesQueryDto } from './routes.query.dto';

function route(overrides: Partial<Route> = {}): Route {
  return {
    airline: 'HA',
    sourceAirport: 'HNL',
    destinationAirport: 'LAS',
    codeShare: '',
    stops: 0,
    equipment: [],
    ...overrides,
  };
}

function aggregatorReturning(routes: Route[]): RoutesAggregator {
  return { getAll: jest.fn(async () => routes) } as unknown as RoutesAggregator;
}

function aggregatorThrowing(err: Error): RoutesAggregator {
  return {
    getAll: jest.fn(async () => {
      throw err;
    }),
  } as unknown as RoutesAggregator;
}

describe('RoutesService', () => {
  it('joins a single equipment token into a one-token string', async () => {
    const svc = new RoutesService(aggregatorReturning([route({ equipment: ['E90'] })]));
    const out = await svc.getAll();
    expect(out).toHaveLength(1);
    expect(out[0].equipment).toBe('E90');
  });

  it('joins multiple equipment tokens with a single space, preserving order', async () => {
    const svc = new RoutesService(
      aggregatorReturning([route({ equipment: ['E90', '320', 'ERJ'] })]),
    );
    const [r] = await svc.getAll();
    expect(r.equipment).toBe('E90 320 ERJ');
  });

  it('renders empty equipment array as empty string (not "[]" or "null")', async () => {
    const svc = new RoutesService(aggregatorReturning([route({ equipment: [] })]));
    const [r] = await svc.getAll();
    expect(r.equipment).toBe('');
  });

  it('returns [] when the aggregator returns []', async () => {
    const svc = new RoutesService(aggregatorReturning([]));
    expect(await svc.getAll()).toEqual([]);
  });

  it('passes scalar fields through unchanged', async () => {
    const svc = new RoutesService(
      aggregatorReturning([
        route({
          airline: 'GR',
          sourceAirport: 'CDG',
          destinationAirport: 'JFK',
          codeShare: 'Y',
          stops: 1,
          equipment: ['320'],
        }),
      ]),
    );
    const [r] = await svc.getAll();
    expect(r).toEqual({
      airline: 'GR',
      sourceAirport: 'CDG',
      destinationAirport: 'JFK',
      codeShare: 'Y',
      stops: 1,
      equipment: '320',
    });
  });

  it('propagates aggregator errors untouched (no swallowing, no wrapping)', async () => {
    const err = new ProviderUnavailableError('all-providers');
    const svc = new RoutesService(aggregatorThrowing(err));
    await expect(svc.getAll()).rejects.toBe(err);
  });

  describe('query filters', () => {
    const dataset: Route[] = [
      route({ airline: 'HA', sourceAirport: 'HNL', destinationAirport: 'LAS', stops: 0 }),
      route({ airline: 'HA', sourceAirport: 'LAS', destinationAirport: 'HNL', stops: 0 }),
      route({ airline: 'GR', sourceAirport: 'CDG', destinationAirport: 'JFK', stops: 1 }),
      route({ airline: 'GR', sourceAirport: 'JFK', destinationAirport: 'CDG', stops: 0 }),
    ];

    function svcWith(query?: RoutesQueryDto) {
      const svc = new RoutesService(aggregatorReturning(dataset));
      return svc.getAll(query);
    }

    it('returns the full set when no query is passed', async () => {
      expect(await svcWith()).toHaveLength(4);
    });

    it('returns the full set when the query has no defined fields', async () => {
      expect(await svcWith({} as RoutesQueryDto)).toHaveLength(4);
    });

    it('filters by sourceAirport', async () => {
      const out = await svcWith({ sourceAirport: 'HNL' });
      expect(out.map((r) => r.destinationAirport)).toEqual(['LAS']);
    });

    it('filters by destinationAirport', async () => {
      const out = await svcWith({ destinationAirport: 'CDG' });
      expect(out).toHaveLength(1);
      expect(out[0].sourceAirport).toBe('JFK');
    });

    it('combines filters with AND semantics', async () => {
      const out = await svcWith({
        sourceAirport: 'HNL',
        destinationAirport: 'LAS',
      });
      expect(out).toHaveLength(1);
      expect(out[0].airline).toBe('HA');
    });

    it('returns [] when nothing matches', async () => {
      expect(await svcWith({ sourceAirport: 'XXX' })).toEqual([]);
    });

    it('matches case-sensitively (hnl ≠ HNL)', async () => {
      expect(await svcWith({ sourceAirport: 'hnl' })).toEqual([]);
    });
  });
});
