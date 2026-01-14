import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional } from 'class-validator';

export class UpdateLocationDto {
  @ApiProperty({ example: 40.7128 })
  @IsNumber()
  lat: number;

  @ApiProperty({ example: -74.006 })
  @IsNumber()
  lng: number;

  @ApiPropertyOptional({ example: 10.5 })
  @IsNumber()
  @IsOptional()
  accuracy?: number;
}
