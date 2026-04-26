import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { RoutesAggregator } from './routes.aggregator';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';

/**
 * Domain module for route aggregation.
 *
 * `RoutesAggregator` is exported in case a future module (e.g. a cache
 * warm-up worker) wants to reuse the merged result without going through
 * HTTP. Service and controller stay private.
 */
@Module({
  imports: [ProvidersModule],
  controllers: [RoutesController],
  providers: [RoutesAggregator, RoutesService],
  exports: [RoutesAggregator],
})
export class RoutesModule {}
