import { ProviderUnavailableError } from '../common/errors/domain.errors';
import { HttpProviderAdapter } from '../providers/http-provider.adapter';
import { ProvidersRegistry } from '../providers/providers.registry';
import { RoutesAggregator } from './routes.aggregator';

type FetchOutcome =
  | { ok: true; body: unknown }
  | { ok: false; err: Error };

function stubAdapter(name: string, outcome: FetchOutcome): HttpProviderAdapter {
  return {
    name,
    url: `https://${name}.example.com`,
    timeoutMs: 1000,
    fetch: jest.fn(async () => {
      if (outcome.ok) return outcome.body;
      throw outcome.err;
    }),
  } as unknown as HttpProviderAdapter;
}

function makeAggregator(
  adapters: HttpProviderAdapter[],
): { aggregator: RoutesAggregator; registry: ProvidersRegistry } {
  const registry = {
    list: () => adapters,
    get: (n: string) => adapters.find((a) => a.name === n),
  } as unknown as ProvidersRegistry;
  const aggregator = new RoutesAggregator(registry);
  // Silence the aggregator's logger — these tests cover behaviour, not output.
  jest
    .spyOn(
      (aggregator as unknown as { logger: { warn: jest.Mock; error: jest.Mock } })
        .logger,
      'warn',
    )
    .mockImplementation(() => undefined);
  jest
    .spyOn(
      (aggregator as unknown as { logger: { warn: jest.Mock; error: jest.Mock } })
        .logger,
      'error',
    )
    .mockImplementation(() => undefined);
  return { aggregator, registry };
}

const recordA = {
  airline: 'HA',
  sourceAirport: 'HNL',
  destinationAirport: 'LAS',
  codeShare: '',
  stops: 0,
  equipment: 'E90',
};
const recordB = {
  airline: 'GR',
  sourceAirport: 'CDG',
  destinationAirport: 'JFK',
  codeShare: '',
  stops: 0,
  equipment: '320',
};
const recordA2 = {
  ...recordA,
  equipment: '320',
  codeShare: 'Y',
};

describe('RoutesAggregator', () => {
  it('merges results from all providers when all succeed', async () => {
    const { aggregator } = makeAggregator([
      stubAdapter('p1', { ok: true, body: [recordA] }),
      stubAdapter('p2', { ok: true, body: [recordB] }),
    ]);

    const out = await aggregator.getAll();
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.airline).sort()).toEqual(['GR', 'HA']);
  });

  it('preserves provider order in the merged output (first-occurrence wins)', async () => {
    const { aggregator } = makeAggregator([
      stubAdapter('p1', { ok: true, body: [recordA] }), // HA HNL-LAS, codeShare=""
      stubAdapter('p2', { ok: true, body: [recordA2] }), // same key, codeShare="Y"
    ]);

    const out = await aggregator.getAll();
    expect(out).toHaveLength(1);
    expect(out[0].codeShare).toBe(''); // p1 wins
    expect(out[0].equipment).toEqual(['E90', '320']); // union
  });

  it('returns surviving provider data when one provider rejects', async () => {
    const { aggregator } = makeAggregator([
      stubAdapter('p1', { ok: true, body: [recordA] }),
      stubAdapter('p2', { ok: false, err: new Error('timeout') }),
    ]);

    const out = await aggregator.getAll();
    expect(out).toHaveLength(1);
    expect(out[0].airline).toBe('HA');
  });

  it('returns surviving provider data when one returns a non-array body', async () => {
    const { aggregator } = makeAggregator([
      stubAdapter('p1', { ok: true, body: [recordA] }),
      stubAdapter('p2', { ok: true, body: { not: 'an array' } }),
    ]);

    const out = await aggregator.getAll();
    expect(out).toHaveLength(1);
  });

  it('still succeeds when one provider returns an empty array', async () => {
    const { aggregator } = makeAggregator([
      stubAdapter('p1', { ok: true, body: [] }),
      stubAdapter('p2', { ok: true, body: [recordB] }),
    ]);
    const out = await aggregator.getAll();
    expect(out).toHaveLength(1);
    expect(out[0].airline).toBe('GR');
  });

  it('throws ProviderUnavailableError when all providers fail', async () => {
    const { aggregator } = makeAggregator([
      stubAdapter('p1', { ok: false, err: new Error('boom') }),
      stubAdapter('p2', { ok: false, err: new Error('boom') }),
    ]);

    await expect(aggregator.getAll()).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
    await expect(aggregator.getAll()).rejects.toMatchObject({
      providerName: 'all-providers',
    });
  });

  it('throws when all providers succeed but every body fails to parse', async () => {
    const { aggregator } = makeAggregator([
      stubAdapter('p1', { ok: true, body: 'not-an-array' }),
      stubAdapter('p2', { ok: true, body: { also: 'not-array' } }),
    ]);

    await expect(aggregator.getAll()).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it('emits a partial-failure warn log when some providers fail', async () => {
    const adapters = [
      stubAdapter('p1', { ok: true, body: [recordA] }),
      stubAdapter('p2', { ok: false, err: new Error('boom') }),
    ];
    const { aggregator } = makeAggregator(adapters);
    const warn = (
      aggregator as unknown as { logger: { warn: jest.Mock } }
    ).logger.warn as jest.Mock;

    await aggregator.getAll();

    const partialLine = warn.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.includes('partial=true'));
    expect(partialLine).toContain('failed=[p2]');
  });
});
