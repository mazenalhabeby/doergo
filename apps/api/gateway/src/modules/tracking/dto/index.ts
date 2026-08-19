import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateTrackingLocationDto {
  @ApiProperty({ example: 40.7128 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ example: -74.006 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @ApiPropertyOptional({ example: 10.5, description: 'Metres of uncertainty.' })
  @IsNumber()
  @Min(0)
  @Max(100000)
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
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ example: -74.006 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @ApiPropertyOptional({ example: 10.5, description: 'Metres of uncertainty.' })
  @IsNumber()
  @Min(0)
  @Max(100000)
  @IsOptional()
  accuracy?: number;

  @ApiPropertyOptional({ description: 'ISO timestamp of when the point was captured on-device' })
  @IsISO8601()
  @IsOptional()
  timestamp?: string;
}

export class BatchTrackingLocationDto {
  @ApiPropertyOptional({ description: 'Task ID the route points belong to' })
  @IsString()
  @IsOptional()
  taskId?: string;

  /**
   * A burst from the device's background tracker. Bounded: every element becomes
   * a row inside one transaction, so an unbounded array is a capacity lever for
   * any authenticated client. A 25m sampling interval makes even a long offline
   * stretch far smaller than this cap.
   */
  @ApiProperty({ type: [TrackingLocationPointDto], description: 'Buffered GPS points in capture order (max 500)' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TrackingLocationPointDto)
  points: TrackingLocationPointDto[];
}
