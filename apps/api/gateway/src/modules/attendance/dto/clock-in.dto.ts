import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, IsBoolean } from 'class-validator';

export class ClockInDto {
  // Optional: not needed for a remote clock-in (no fixed site).
  @ApiPropertyOptional({ description: 'Location ID to clock in at (omit for remote)' })
  @IsString()
  @IsOptional()
  locationId?: string;

  @ApiProperty({ description: 'Current latitude' })
  @IsNumber()
  @IsNotEmpty()
  lat: number;

  @ApiProperty({ description: 'Current longitude' })
  @IsNumber()
  @IsNotEmpty()
  lng: number;

  @ApiPropertyOptional({ description: 'GPS accuracy in meters' })
  @IsNumber()
  @IsOptional()
  accuracy?: number;

  @ApiPropertyOptional({ description: 'Clock in remotely (WFH/anywhere), geofence-exempt' })
  @IsBoolean()
  @IsOptional()
  isRemote?: boolean;
}
