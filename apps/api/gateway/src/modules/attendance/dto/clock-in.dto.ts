import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class ClockInDto {
  @ApiProperty({ description: 'Location ID to clock in at' })
  @IsString()
  @IsNotEmpty()
  locationId: string;

  @ApiProperty({ description: 'Current latitude' })
  @IsNumber()
  lat: number;

  @ApiProperty({ description: 'Current longitude' })
  @IsNumber()
  lng: number;

  @ApiPropertyOptional({ description: 'GPS accuracy in meters' })
  @IsNumber()
  @IsOptional()
  accuracy?: number;
}
