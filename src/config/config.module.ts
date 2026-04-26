import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './env.schema';
import { TypedConfigService } from './typed-config.service';

/**
 * Global config module.
 *
 * - `validate: validateEnv` runs the zod schema at boot. Any missing or
 *   invalid env variable throws here, before the HTTP server starts
 *   listening.
 * - `isGlobal: true` on `ConfigModule.forRoot` exposes the underlying
 *   `ConfigService` to every module.
 * - `@Global()` on this wrapper does the same for `TypedConfigService`,
 *   which is *our* provider — not Nest's. Both flags are needed; they
 *   cover different providers.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      cache: true,
    }),
  ],
  providers: [TypedConfigService],
  exports: [TypedConfigService],
})
export class AppConfigModule {}
