import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class ClockOutDto {
  // Optional: clock-out is allowed without a GPS fix. When absent the geofence
  // check is skipped and coords are stored null (no spurious (0,0) point).
  @ApiPropertyOptional({ description: 'Current latitude' })
  @IsNumber()
  @IsOptional()
  lat?: number;

  @ApiPropertyOptional({ description: 'Current longitude' })
  @IsNumber()
  @IsOptional()
  lng?: number;

  @ApiPropertyOptional({ description: 'GPS accuracy in meters' })
  @IsNumber()
  @IsOptional()
  accuracy?: number;

  @ApiPropertyOptional({ description: 'Notes about the shift' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
