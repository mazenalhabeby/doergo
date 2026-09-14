import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsISO8601, IsNumber, IsNotEmpty, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

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

/** One check-in the phone kept while it had no signal, with the moment it was taken. */
export class HeartbeatPointDto {
  @ApiProperty() @IsNumber() @Min(-90) @Max(90)
  lat: number;

  @ApiProperty() @IsNumber() @Min(-180) @Max(180)
  lng: number;

  @ApiPropertyOptional() @IsNumber() @IsOptional() @Min(0)
  accuracy?: number;

  @ApiProperty({ description: 'When the fix was taken (ISO 8601)' }) @IsISO8601()
  recordedAt: string;
}

export class HeartbeatBatchDto {
  @ApiProperty({ type: [HeartbeatPointDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => HeartbeatPointDto)
  points: HeartbeatPointDto[];
}

/** "I'm working extra time", with the moment it was asked when sent from a queue. */
export class RequestExtraTimeDto {
  @ApiPropertyOptional({ description: 'When the member asked (ISO 8601)' }) @IsOptional() @IsISO8601()
  occurredAt?: string;
}
