import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** A GPS fix taken at the moment of the tap. */
export class OccurrenceFixDto {
  @ApiProperty() @IsNumber() @Min(-90) @Max(90) lat: number;
  @ApiProperty() @IsNumber() @Min(-180) @Max(180) lng: number;
  @ApiProperty({ description: 'Metres' }) @IsNumber() @Min(0) @Max(100_000) accuracy: number;
  @ApiProperty() @IsISO8601() fixAt: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() mocked?: boolean;
}

class AnchorDto {
  @ApiProperty() @IsISO8601() serverTime: string;
  @ApiProperty() @IsNumber() @Min(0) uptimeMs: number;
}

/**
 * When — and where — an action actually happened, recorded on the phone.
 *
 * Shared by every route an offline phone replays late (status changes, clock
 * in/out, breaks). The server judges it with the shared `assessOccurrence` /
 * `assessFix`, the same rules the phone ran for its instant answer.
 */
export class OccurrenceEvidenceDto {
  @ApiProperty() @IsISO8601({ strict: true }) occurredAt: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) uptimeMs?: number;
  @ApiPropertyOptional({ type: AnchorDto }) @IsOptional() @ValidateNested() @Type(() => AnchorDto) anchor?: AnchorDto;
  @ApiPropertyOptional({ type: OccurrenceFixDto }) @IsOptional() @ValidateNested() @Type(() => OccurrenceFixDto) fix?: OccurrenceFixDto;
}
