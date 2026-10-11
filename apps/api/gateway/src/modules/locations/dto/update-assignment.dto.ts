import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, ValidateIf } from 'class-validator';
import { AssignMemberDto } from './assign-technician.dto';

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
}
