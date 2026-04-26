import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ProvidersRegistry } from './providers.registry';

/**
 * Owns the HTTP transport for outbound provider calls. `HttpModule` is
 * configured once here — a single shared `HttpService` (and underlying
 * axios instance) for all adapters. Building one axios instance per
 * provider would multiply connection pools without buying isolation we
 * actually need.
 *
 * Per-request timeouts are passed by the adapter on each call, so no
 * global `HttpModule.register({ timeout })` here.
 *
 * `TypedConfigService` is provided by the `@Global` `AppConfigModule`,
 * so it doesn't need to be re-imported.
 */
@Module({
  imports: [HttpModule],
  providers: [ProvidersRegistry],
  exports: [ProvidersRegistry],
})
export class ProvidersModule {}
