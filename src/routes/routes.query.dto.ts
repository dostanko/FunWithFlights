import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RoutesQueryDto {
  @ApiPropertyOptional({
    description:
      'Exact-match filter on the origin airport code (case-sensitive). Combines with other filters via AND.',
    example: 'HNL',
  })
  @IsOptional()
  @IsString()
  sourceAirport?: string;

  @ApiPropertyOptional({
    description: 'Exact-match filter on the destination airport code (case-sensitive).',
    example: 'LAS',
  })
  @IsOptional()
  @IsString()
  destinationAirport?: string;
}
