import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** A log type's key as a kind stores it. `cost` is the ledger. */
const LOG_KEY = /^[a-z0-9_]{1,40}$/;

/**
 * File one logbook entry.
 *
 * `values` is checked against the kind's log type IN THE SERVICE, by the same
 * shared `validateLogValues` the phone runs before sending — the shape of that
 * object is configuration, so no DTO could describe it. What the DTO bounds is
 * everything around it.
 */
export class CreateLogEntryDto {
  /** Made on the phone: an entry filed twice is one entry. */
  @ApiPropertyOptional({ description: 'Id made on the phone for this entry' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{16,64}$/)
  entryId?: string;

  @ApiPropertyOptional({ description: 'A log type the KIND declares. Omitted or "cost" is the ledger.' })
  @IsOptional()
  @IsString()
  @Matches(LOG_KEY)
  logType?: string;

  @ApiPropertyOptional({ description: 'Answers keyed by field key. Money in integer cents.' })
  @IsOptional()
  @IsObject()
  values?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ description: 'When it happened — it decides WHO may log it. Now, if omitted.' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional({ description: 'The key returned by presign. Checked against this asset.' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  receiptKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  receiptName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  receiptMime?: string;
}

export class LogPresignDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(LOG_KEY)
  logType?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({ description: 'An image or a PDF. Anything else is refused.' })
  @IsString()
  @MaxLength(100)
  mimeType!: string;

  @ApiPropertyOptional({ description: 'When it happened — it decides WHO may log it.' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

export class LogListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(LOG_KEY)
  logType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  authorId?: string;

  @ApiPropertyOptional({ enum: ['RECORDED', 'SUBMITTED', 'REJECTED'] })
  @IsOptional()
  @IsIn(['RECORDED', 'SUBMITTED', 'REJECTED'])
  status?: string;

  @ApiPropertyOptional({ description: 'The last id of the previous page' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class LogSummaryQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class MyLogQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  assetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

