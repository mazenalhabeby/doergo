/** Moved here unchanged from dto/index.ts. */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ATTENDANCE_CONSTANTS, DependencyType, TaskAssigneeRole } from '@hbcfield/shared';
import { OccurrenceEvidenceDto } from '../../../../common/dto/occurrence.dto';
import { Type } from 'class-transformer';
import { CLIENT_ID } from '../../../../common/dto/upload.dto';
import { OnBehalfDto } from './task-dtos';

export class UpdateStatusDto {
  @ApiProperty({ description: 'Target status key (e.g. "IN_PROGRESS", "COMPLETED", or custom workflow status key)' })
  @IsString()
  @IsNotEmpty()
  status: string;

  @ApiPropertyOptional({ example: 'Waiting for parts' })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ description: 'Current latitude for location verification' })
  @IsNumber()
  @IsOptional()
  lat?: number;

  @ApiPropertyOptional({ description: 'Current longitude for location verification' })
  @IsNumber()
  @IsOptional()
  lng?: number;

  /**
   * The error radius the device reported, in metres.
   *
   * Sent so the arrival check can widen its zone by it instead of judging a
   * fuzzy fix as though it were exact — a phone saying "here, ±40m" was being
   * refused for standing 35 metres from a door it was at. Bounded: a useless
   * fix must not be able to wave anything through, so anything beyond
   * MAX_GEOFENCE_RADIUS is rejected rather than trusted.
   */
  @ApiPropertyOptional({ description: 'GPS accuracy in metres, as reported by the device' })
  @IsNumber()
  @Min(0)
  @Max(ATTENDANCE_CONSTANTS.MAX_GEOFENCE_RADIUS)
  @IsOptional()
  accuracy?: number;

  /**
   * The status the phone saw when the member tapped. If the task has since
   * moved elsewhere (the office cancelled or reassigned it while they were
   * offline), the change is refused with 409 TASK_STATE_CONFLICT and the task's
   * current state, instead of being applied on top of something they never saw.
   */
  @ApiPropertyOptional({ description: 'The status the change was made from' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  expectedFrom?: string;

  @ApiPropertyOptional({ type: OccurrenceEvidenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OccurrenceEvidenceDto)
  evidence?: OccurrenceEvidenceDto;

  @ApiPropertyOptional({ type: OnBehalfDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OnBehalfDto)
  onBehalf?: OnBehalfDto;

  /**
   * Answers to the form of the step being moved into, keyed by field id —
   * see `workflows/step-form` in shared. Only its SHAPE is checked here (an
   * object); every value is judged in task-service against the step's own
   * definition, where an unknown key, a missing required answer or a photo
   * from another job is refused (400 STEP_FORM_INVALID / STEP_FORM_FOREIGN_FILE).
   */
  @ApiPropertyOptional({
    description:
      'Step form answers, keyed by field id (note/name/choice/date/signature: ' +
      'string; photos: string[]; number: number; yesno: boolean)',
    type: Object,
  })
  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;
}

export class AddAssigneeDto {
  @ApiProperty({ description: 'User ID to add as assignee' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiPropertyOptional({ enum: TaskAssigneeRole, default: TaskAssigneeRole.MEMBER })
  @IsEnum(TaskAssigneeRole)
  @IsOptional()
  role?: TaskAssigneeRole;
}

export class AddChecklistItemDto {
  @ApiProperty({ description: 'Checklist item text', example: 'Inspect wiring' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  text: string;

  @ApiPropertyOptional({ description: 'Position/order of the item', example: 0 })
  @IsInt()
  @IsOptional()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({ description: 'Whose part of the work it is — somebody on the job\'s crew, or null for nobody', nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.assigneeId !== null)
  @IsString()
  @Matches(CLIENT_ID)
  assigneeId?: string | null;
}

export class UpdateChecklistItemDto {
  @ApiPropertyOptional({ description: 'Updated text for the checklist item' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  text?: string;

  @ApiPropertyOptional({ description: 'Whether the item is completed' })
  @IsBoolean()
  @IsOptional()
  isCompleted?: boolean;

  @ApiPropertyOptional({ description: 'Whose part of the work it is — somebody on the job\'s crew, or null for nobody', nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.assigneeId !== null)
  @IsString()
  @Matches(CLIENT_ID)
  assigneeId?: string | null;
}

export class ReorderChecklistDto {
  @ApiProperty({ description: 'Ordered array of checklist item IDs', type: [String] })
  @IsArray()
  @IsString({ each: true })
  itemIds: string[];
}

export class CreateDependencyDto {
  @ApiProperty({ description: 'Predecessor task ID' })
  @IsString()
  @IsNotEmpty()
  predecessorId: string;

  @ApiPropertyOptional({ enum: DependencyType, default: DependencyType.FINISH_TO_START })
  @IsEnum(DependencyType)
  @IsOptional()
  type?: DependencyType;

  @ApiPropertyOptional({ description: 'Lag days (can be negative for lead time)', example: 0 })
  @IsInt()
  @IsOptional()
  lagDays?: number;
}

export class AddCommentDto {
  @ApiPropertyOptional({ description: 'Id made on the phone; a retry with the same id returns the same comment' })
  @IsOptional()
  @IsString()
  @Matches(CLIENT_ID)
  id?: string;

  @ApiProperty({ description: 'Comment text', example: 'Looks good to me' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;
}
