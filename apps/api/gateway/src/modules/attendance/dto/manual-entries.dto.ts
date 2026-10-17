import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The office adds or back-dates hours for somebody (one day, or a weekday range).
 * Shapes only — the service still decides who, where and whether it fits.
 */
export class AddManualEntriesDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  userId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  locationId!: string;

  @ApiProperty({ example: '2026-10-16' })
  @Matches(DAY)
  startDate!: string;

  @ApiProperty({ example: '2026-10-16' })
  @Matches(DAY)
  endDate!: string;

  @ApiPropertyOptional({ description: '0 = Sunday … 6 = Saturday, for a range' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[];

  @ApiProperty({ example: '08:00' })
  @Matches(HM)
  startTime!: string;

  @ApiProperty({ example: '16:30' })
  @Matches(HM)
  endTime!: string;

  @ApiPropertyOptional({ example: '12:00' })
  @IsOptional()
  @Matches(HM)
  breakStart?: string;

  @ApiPropertyOptional({ example: '12:30' })
  @IsOptional()
  @Matches(HM)
  breakEnd?: string;

  @ApiPropertyOptional({ enum: ['SHORT', 'LUNCH', 'OTHER'] })
  @IsOptional()
  @IsIn(['SHORT', 'LUNCH', 'OTHER'])
  breakType?: 'SHORT' | 'LUNCH' | 'OTHER';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  breakReason?: string;

  /** Older clients describe the break as minutes; the service turns it into the same row. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  breakMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Approve several time entries at once — bounded, like every bulk route. */
export class BulkApproveEntriesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  entryIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
