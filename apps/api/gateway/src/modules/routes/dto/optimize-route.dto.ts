import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  IsIn,
  ValidateNested,
  ArrayMaxSize,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WaypointDto {
  @ApiProperty()
  @IsNumber()
  lat!: number;

  @ApiProperty()
  @IsNumber()
  lng!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;
}

export class RouteStopDto extends WaypointDto {
  @ApiProperty({ description: "Caller's stop id (taskId / leadId / free) — echoed back in order" })
  @IsString()
  @MaxLength(64)
  id!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;
}

export class OptimizeRouteDto {
  @ApiProperty({ type: WaypointDto })
  @ValidateNested()
  @Type(() => WaypointDto)
  start!: WaypointDto;

  @ApiProperty({ type: [RouteStopDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => RouteStopDto)
  stops!: RouteStopDto[];

  @ApiPropertyOptional({ type: WaypointDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WaypointDto)
  end?: WaypointDto;

  @ApiPropertyOptional({ enum: ['driving'] })
  @IsOptional()
  @IsIn(['driving'])
  profile?: 'driving';

  @ApiPropertyOptional({ description: 'Return to start when no explicit end is given' })
  @IsOptional()
  @IsBoolean()
  roundTrip?: boolean;
}
