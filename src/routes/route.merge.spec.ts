import { Route } from './route.dto';
import { mergeRoutes } from './route.merge';

function r(airline: string, src: string, dst: string, overrides: Partial<Route> = {}): Route {
  return {
    airline,
    sourceAirport: src,
    destinationAirport: dst,
    codeShare: '',
    stops: 0,
    equipment: [],
    ...overrides,
  };
}

describe('mergeRoutes', () => {
  it('returns [] for empty input', () => {
    expect(mergeRoutes([])).toEqual([]);
  });

  it('passes through a single provider unchanged', () => {
    const input = [[r('HA', 'HNL', 'LAS', { equipment: ['320'] }), r('HA', 'LAS', 'HNL')]];
    expect(mergeRoutes(input)).toEqual([
      r('HA', 'HNL', 'LAS', { equipment: ['320'] }),
      r('HA', 'LAS', 'HNL'),
    ]);
  });

  it('concatenates two providers when keys do not overlap', () => {
    const a = [r('HA', 'HNL', 'LAS')];
    const b = [r('GR', 'CDG', 'JFK')];
    const out = mergeRoutes([a, b]);
    expect(out).toHaveLength(2);
    expect(out.map((x) => x.airline)).toEqual(['HA', 'GR']);
  });

  it('preserves first-provider codeShare on overlap', () => {
    const first = [r('HA', 'HNL', 'LAS', { codeShare: 'Y', stops: 0, equipment: ['320'] })];
    const second = [r('HA', 'HNL', 'LAS', { codeShare: '', stops: 0, equipment: ['ERJ'] })];
    const out = mergeRoutes([first, second]);

    expect(out).toHaveLength(1);
    expect(out[0].codeShare).toBe('Y');
    expect(out[0].stops).toBe(0);
  });

  it('treats different stops as different routes (stops is part of the key)', () => {
    const first = [r('HA', 'HNL', 'LAS', { stops: 0, equipment: ['320'] })];
    const second = [r('HA', 'HNL', 'LAS', { stops: 1, equipment: ['ERJ'] })];
    const out = mergeRoutes([first, second]);

    expect(out).toHaveLength(2);
    expect(out.map((x) => x.stops)).toEqual([0, 1]);
    expect(out[0].equipment).toEqual(['320']);
    expect(out[1].equipment).toEqual(['ERJ']);
  });

  it('takes set-union of equipment on overlap, preserving order', () => {
    const first = [r('HA', 'HNL', 'LAS', { equipment: ['E90', '320'] })];
    const second = [r('HA', 'HNL', 'LAS', { equipment: ['E90', 'ERJ'] })];
    const out = mergeRoutes([first, second]);

    expect(out[0].equipment).toEqual(['E90', '320', 'ERJ']);
  });

  it('unions equipment across three overlapping providers', () => {
    const out = mergeRoutes([
      [r('HA', 'HNL', 'LAS', { equipment: ['E90'] })],
      [r('HA', 'HNL', 'LAS', { equipment: ['320'] })],
      [r('HA', 'HNL', 'LAS', { equipment: ['ERJ'] })],
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].equipment).toEqual(['E90', '320', 'ERJ']);
  });

  it('handles empty equipment from later providers (no contribution)', () => {
    const first = [r('HA', 'HNL', 'LAS', { equipment: ['320'] })];
    const second = [r('HA', 'HNL', 'LAS', { equipment: [] })];
    const out = mergeRoutes([first, second]);
    expect(out[0].equipment).toEqual(['320']);
  });

  it('preserves first-occurrence output order across providers', () => {
    const a = [r('HA', 'HNL', 'LAS'), r('HA', 'LAS', 'HNL')];
    const b = [r('GR', 'CDG', 'JFK'), r('HA', 'HNL', 'LAS')];
    const out = mergeRoutes([a, b]);
    expect(out.map((x) => `${x.airline}:${x.sourceAirport}-${x.destinationAirport}`)).toEqual([
      'HA:HNL-LAS',
      'HA:LAS-HNL',
      'GR:CDG-JFK',
    ]);
  });

  it('does not mutate the caller input', () => {
    const first = [r('HA', 'HNL', 'LAS', { equipment: ['320'] })];
    const second = [r('HA', 'HNL', 'LAS', { equipment: ['ERJ'] })];
    mergeRoutes([first, second]);
    expect(first[0].equipment).toEqual(['320']);
    expect(second[0].equipment).toEqual(['ERJ']);
  });
});
