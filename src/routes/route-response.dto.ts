import { ApiProperty } from '@nestjs/swagger';

export class RouteResponseDto {
  @ApiProperty({
    description: 'IATA airline code, e.g. `HA`.',
    example: 'HA',
  })
  airline!: string;

  @ApiProperty({
    description: 'IATA code of the origin airport, e.g. `HNL`.',
    example: 'HNL',
  })
  sourceAirport!: string;

  @ApiProperty({
    description: 'IATA code of the destination airport, e.g. `LAS`.',
    example: 'LAS',
  })
  destinationAirport!: string;

  @ApiProperty({
    description:
      'Code-share marker. `"Y"` if the route is a code-share, otherwise empty string. Kept as a string to match the upstream provider contract.',
    example: '',
  })
  codeShare!: string;

  @ApiProperty({
    description: 'Number of stops on the route. `0` for a direct flight.',
    example: 0,
  })
  stops!: number;

  @ApiProperty({
    description:
      'Space-separated list of equipment codes used on the route, e.g. `"E90 320"`. Empty string if no equipment was reported. Internally this is the set-union of the equipment arrays returned by every provider that contributed to this record.',
    example: 'E90 320',
  })
  equipment!: string;
}
