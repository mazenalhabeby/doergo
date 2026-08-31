import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { BreakType } from './start-break.dto';

/**
 * A break added to somebody else's shift.
 *
 * Both ends are supplied, unlike a member's own break, which is started and
 * ended live. This one is entered after the fact, so it is a closed interval
 * from the outset — there is no such thing as opening a break on a shift that
 * has already been worked.
 *
 * The reason is REQUIRED, and not merely present: this changes paid hours on
 * somebody else's timesheet, and "why" is the first question anyone asks when
 * they notice it later.
 */
export class AddBreakForMemberDto {
  @ApiPropertyOptional({ enum: BreakType, default: BreakType.SHORT })
  @IsEnum(BreakType)
  @IsOptional()
  type?: BreakType;

  @ApiProperty({ description: 'When the break started (ISO 8601)' })
  @IsISO8601()
  startedAt!: string;

  @ApiProperty({ description: 'When the break ended (ISO 8601)' })
  @IsISO8601()
  endedAt!: string;

  @ApiProperty({ description: 'Why this break is being added to the member’s shift' })
  @IsString()
  @IsNotEmpty()
  // Long enough to be a sentence; a two-character reason is not one.
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
