import { HttpService } from '@nestjs/axios';
import { TypedConfigService } from '../config/typed-config.service';
import { HttpProviderAdapter } from './http-provider.adapter';
import { ProvidersRegistry } from './providers.registry';

function makeRegistry(opts: {
  names: string[];
  timeoutMs?: number;
  urlFor?: (name: string) => string;
}): ProvidersRegistry {
  const cfg: Partial<TypedConfigService> = {
    providerNames: opts.names,
    httpTimeoutMs: opts.timeoutMs ?? 5000,
    // Disable warm-up in unit tests — the stub HttpService below would
    // throw on a real fetch() call.
    providersWarmup: false,
    getProviderUrl: (name: string) =>
      (opts.urlFor ?? ((n: string) => `https://${n}.example.com/routes`))(name),
  };
  // HttpService is just stashed and passed through to adapters in this test.
  const http = {} as HttpService;
  return new ProvidersRegistry(cfg as TypedConfigService, http);
}

describe('ProvidersRegistry', () => {
  it('builds one adapter per name in PROVIDERS, in declaration order', () => {
    const registry = makeRegistry({ names: ['p1', 'p2'] });
    registry.onModuleInit();

    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list[0]).toBeInstanceOf(HttpProviderAdapter);
    expect(list.map((a) => a.name)).toEqual(['p1', 'p2']);
  });

  it('builds a single adapter when only one provider is configured', () => {
    const registry = makeRegistry({ names: ['p1'] });
    registry.onModuleInit();

    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0].name).toBe('p1');
  });

  it('threads url and timeout from TypedConfigService into each adapter', () => {
    const registry = makeRegistry({
      names: ['p1', 'p2'],
      timeoutMs: 1234,
      urlFor: (n) => `https://${n}.test/routes`,
    });
    registry.onModuleInit();

    const [a1, a2] = registry.list();
    expect(a1.url).toBe('https://p1.test/routes');
    expect(a1.timeoutMs).toBe(1234);
    expect(a2.url).toBe('https://p2.test/routes');
    expect(a2.timeoutMs).toBe(1234);
  });

  it('throws on init when PROVIDERS resolves to an empty list', () => {
    const registry = makeRegistry({ names: [] });
    expect(() => registry.onModuleInit()).toThrow(/No providers configured/);
  });

  it('returns an empty list before onModuleInit has run', () => {
    const registry = makeRegistry({ names: ['p1'] });
    expect(registry.list()).toEqual([]);
  });
});
