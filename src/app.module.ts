import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { AppLoggerModule } from './common/logging/app-logger.module';
import { HealthModule } from './common/health/health.module';
import { ErrorsModule } from './common/errors/errors.module';
import { ProvidersModule } from './providers/providers.module';
import { RoutesModule } from './routes/routes.module';

/**
 * Root module — imports only. No controllers or providers live here;
 * each cross-cutting concern (config, logging, health, errors) and
 * domain module owns its own wiring.
 */
@Module({
  imports: [
    AppConfigModule,
    AppLoggerModule,
    HealthModule,
    ErrorsModule,
    ProvidersModule,
    RoutesModule,
  ],
})
export class AppModule {}
