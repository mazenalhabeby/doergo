import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsArray,
  ArrayMaxSize,
  IsDateString,
  ValidateIf,
} from 'class-validator';

export class UpdateAssignmentDto {
  @ApiPropertyOptional({
    description: 'Is this the primary work location',
  })
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;

  /**
   * May this member work away from THIS workspace?
   *
   * Three states, and all three are meaningful: `true` grants it here, `false`
   * refuses it here even when their account allows it, and `null` clears the
   * override so their account answers again. Omitting the field entirely leaves
   * whatever is there — "no opinion" and "explicitly refused" must not collapse
   * into one another.
   */
  @ApiPropertyOptional({
    nullable: true,
    description: 'true = allowed here · false = refused here · null = follow the member’s account',
  })
  @IsBoolean()
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  allowRemote?: boolean | null;

  @ApiPropertyOptional({
    description: 'Work schedule days',
    example: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    type: [String],
  })
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(7)
  schedule?: string[];

  @ApiPropertyOptional({ description: 'Assignment start date' })
  @IsDateString()
  @IsOptional()
  effectiveFrom?: string;

  @ApiPropertyOptional({
    description: 'Assignment end date (null = indefinite)',
  })
  @IsDateString()
  @IsOptional()
  effectiveTo?: string;
}
