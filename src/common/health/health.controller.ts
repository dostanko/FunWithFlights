import { Controller, Get } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

/**
 * Liveness endpoint, excluded from Swagger because it's an infra
 * concern, not part of the public API contract.
 *
 * `GET /health` answers "is the process up at all?" — ECS uses it to
 * decide whether to restart the task. The check list is intentionally
 * empty: a 200 here means Node is alive enough to answer, which is the
 * right semantic for liveness.
 *
 * No `/ready` endpoint: readiness for this service does not depend on
 * upstream provider availability. Provider outages are handled by the
 * aggregator (partial failure → still 200, all-fail → 502); draining
 * the task from the load balancer would not improve that. If a future
 * readiness contract emerges (e.g. cache warmed up), add it here.
 */
@Controller()
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get('health')
  @HealthCheck()
  @ApiExcludeEndpoint()
  liveness() {
    return this.health.check([]);
  }
}
