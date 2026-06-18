import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateTrackingLocationDto {
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

  @ApiPropertyOptional({ description: 'Task ID if tracking for a specific task' })
  @IsString()
  @IsOptional()
  taskId?: string;
}

export class TrackingLocationPointDto {
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

  @ApiPropertyOptional({ description: 'ISO timestamp of when the point was captured on-device' })
  @IsString()
  @IsOptional()
  timestamp?: string;
}

export class BatchTrackingLocationDto {
  @ApiPropertyOptional({ description: 'Task ID the route points belong to' })
  @IsString()
  @IsOptional()
  taskId?: string;

  @ApiProperty({ type: [TrackingLocationPointDto], description: 'Buffered GPS points in capture order' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrackingLocationPointDto)
  points: TrackingLocationPointDto[];
}
