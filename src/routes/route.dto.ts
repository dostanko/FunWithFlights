import { IsArray, IsInt, IsString } from 'class-validator';

export class Route {
  @IsString()
  airline!: string;

  @IsString()
  sourceAirport!: string;

  @IsString()
  destinationAirport!: string;

  @IsString()
  codeShare!: string;

  @IsInt()
  stops!: number;

  @IsArray()
  @IsString({ each: true })
  equipment!: string[];
}
