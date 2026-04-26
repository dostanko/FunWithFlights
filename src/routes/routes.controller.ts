import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/errors/error-response.dto';
import { RouteResponseDto } from './route-response.dto';
import { RoutesQueryDto } from './routes.query.dto';
import { RoutesService } from './routes.service';

@ApiTags('routes')
@Controller('routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Get()
  @ApiOperation({
    summary: 'List aggregated flight routes',
    description:
      'Fetches routes in parallel from every configured upstream provider, drops invalid records, deduplicates by (airline, sourceAirport, destinationAirport) using first-provider-wins semantics, and unions the equipment lists. Partial provider failures are absorbed; only an all-provider failure produces a 502. Optional query parameters apply an AND-combined exact-match filter to the merged result.',
  })
  @ApiOkResponse({
    type: [RouteResponseDto],
    description: 'Merged route catalog. May be an empty array.',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Query parameters failed validation (e.g. `?stops=foo`).',
  })
  @ApiBadGatewayResponse({
    type: ErrorResponseDto,
    description: 'All upstream providers failed or returned unparseable data.',
  })
  async findAll(@Query() query: RoutesQueryDto): Promise<RouteResponseDto[]> {
    return this.routesService.getAll(query);
  }
}
