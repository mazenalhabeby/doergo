import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsObject, IsOptional, ValidateIf } from 'class-validator';
import { AUTO_CLOCK_MODES, type AutoClockMode, type AutoClockStartWindow } from '@hbcfield/shared';
import { AssignMemberDto } from './assign-member.dto';

/** What assigning accepts, minus WHO (an assignment's member never changes), plus the away override. */
export class UpdateAssignmentDto extends PartialType(OmitType(AssignMemberDto, ['userId'] as const)) {
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

  /**
   * Chosen for the automatic clock in THIS workspace. Arms only where the
   * workspace switched it on and the member consented. Refused for an external
   * member. May be set by whoever manages this workspace's people.
   */
  @ApiPropertyOptional({ description: 'Chosen for the automatic clock here' })
  @IsBoolean()
  @IsOptional()
  autoClock?: boolean;

  /** How the automatic clock decides for them here: by their shift, or by arriving and leaving (no fixed shift). */
  @ApiPropertyOptional({ enum: AUTO_CLOCK_MODES })
  @IsIn(AUTO_CLOCK_MODES as unknown as string[])
  @IsOptional()
  autoClockMode?: AutoClockMode;

  /**
   * Arriving and leaving only: the local hours an arrival starts work on its
   * own — { from: "HH:MM", to: "HH:MM" }. null = any time. Checked strictly by
   * the service (a malformed one is refused, never read as "any time").
   */
  @ApiPropertyOptional({ nullable: true, example: { from: '19:00', to: '23:00' } })
  @IsObject()
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  autoClockStartWindow?: AutoClockStartWindow | null;
}
