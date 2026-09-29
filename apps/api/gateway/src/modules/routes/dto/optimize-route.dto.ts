import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  IsDefined,
  IsIn,
  Max,
  Min,
  ValidateNested,
  ArrayMaxSize,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class WaypointDto {
  /*
    ⚠️ A REAL PLACE ONLY. `@IsNumber()` alone accepted lat 999, which the
    optimizer then measured: an 18 000 km "route" handed back as a plan.
  */
  @ApiProperty()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;
}

class RouteStopDto extends WaypointDto {
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
  // ⚠️ `@IsDefined`: `@ValidateNested` skips a missing value, and a request with no start was a 500.
  @ApiProperty({ type: WaypointDto })
  @IsDefined()
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
