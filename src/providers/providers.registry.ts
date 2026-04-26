import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { TypedConfigService } from '../config/typed-config.service';
import { HttpProviderAdapter } from './http-provider.adapter';

/**
 * Builds and holds one `HttpProviderAdapter` per name in `PROVIDERS`,
 * in declaration order. The aggregator iterates `list()` to fan out
 * each request; stable order also keeps log lines deterministic when
 * debugging.
 *
 * Construction happens in `onModuleInit` rather than the constructor so
 * `TypedConfigService` is fully resolved by the time we read it.
 */
@Injectable()
export class ProvidersRegistry implements OnModuleInit {
  private readonly logger = new Logger(ProvidersRegistry.name);
  private adapters: HttpProviderAdapter[] = [];

  constructor(
    private readonly cfg: TypedConfigService,
    private readonly http: HttpService,
  ) {}

  onModuleInit(): void {
    const names = this.cfg.providerNames;

    // Defensive: env validation already guarantees this, but failing
    // loudly here means we don't quietly start with zero providers if
    // the schema ever loosens.
    if (names.length === 0) {
      throw new Error('No providers configured: PROVIDERS env var resolved to an empty list');
    }

    this.adapters = names.map(
      (name) =>
        new HttpProviderAdapter(
          name,
          this.cfg.getProviderUrl(name),
          this.cfg.httpTimeoutMs,
          this.http,
        ),
    );

    this.logger.log(
      `Registered ${this.adapters.length} provider(s): ${this.adapters
        .map((a) => a.name)
        .join(', ')}`,
    );

    if (this.cfg.providersWarmup) {
      this.warmUp();
    }
  }

  /** Read-only view used by the aggregator. Order matches `PROVIDERS`. */
  list(): readonly HttpProviderAdapter[] {
    return this.adapters;
  }

  /**
   * Fire-and-forget warm-up: hit every provider once so upstream Lambda
   * containers are warm by the time real client traffic lands.
   */
  private warmUp(): void {
    void Promise.allSettled(this.adapters.map((a) => a.fetch())).then((results) => {
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - ok;
      this.logger.log(`Warm-up complete: ok=${ok} failed=${failed}`);
    });
  }
}
