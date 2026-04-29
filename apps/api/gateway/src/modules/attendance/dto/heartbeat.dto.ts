import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsNotEmpty, IsOptional } from 'class-validator';

export class HeartbeatDto {
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
}
