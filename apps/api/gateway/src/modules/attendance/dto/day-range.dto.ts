import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}/;

/** `startDate` + `endDate` (yyyy-MM-dd) required, `userId` optional — a missing day is a 400, never a 500. */
export class DayRangeQueryDto {
  @ApiProperty({ example: '2026-10-01' })
  @Matches(DAY, { message: 'startDate must be a day, yyyy-MM-dd' })
  startDate!: string;

  @ApiProperty({ example: '2026-10-31' })
  @Matches(DAY, { message: 'endDate must be a day, yyyy-MM-dd' })
  endDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;
}
