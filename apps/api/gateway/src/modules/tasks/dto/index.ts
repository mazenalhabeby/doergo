import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsString, IsEnum, IsOptional, IsDateString, IsNumber, IsNotEmpty, MaxLength, IsArray, IsBoolean, IsInt, Min, Max, ValidateNested, Matches, IsObject, ValidateIf } from 'class-validator';
import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { OccurrenceEvidenceDto } from '../../../common/dto/occurrence.dto';
import { CLIENT_ID } from '../../../common/dto/upload.dto';
import { TaskPriority, TaskAssigneeRole, DependencyType, TASK_TITLE_MAX_LENGTH, TASK_DESCRIPTION_MAX_LENGTH, ATTENDANCE_CONSTANTS, HANDOVER_NOTE_MAX, HANDOVER_PHOTOS_MAX, OFFICE_START_REASON_MAX, CREW_REASON_MAX, LEAD_SCOPES, ROLE_SPOTS_MAX, type LeadScope } from '@hbcfield/shared';

/**
 * Create task request DTO
 */
export class CreateTaskDto {
  @ApiPropertyOptional({ description: 'Id made on the phone; a resend returns the same task' })
  @IsOptional()
  @IsString()
  @Matches(CLIENT_ID)
  id?: string;

  @ApiProperty({ example: 'Fix leaking pipe' })
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(TASK_TITLE_MAX_LENGTH, { message: `Title must not exceed ${TASK_TITLE_MAX_LENGTH} characters` })
  title: string;

  @ApiPropertyOptional({ example: 'Customer reported water leak in kitchen' })
  @IsString()
  @IsOptional()
  @MaxLength(TASK_DESCRIPTION_MAX_LENGTH, { message: `Description must not exceed ${TASK_DESCRIPTION_MAX_LENGTH} characters` })
  description?: string;

  @ApiPropertyOptional({ enum: TaskPriority, default: TaskPriority.MEDIUM })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @ApiPropertyOptional({ example: 40.7128 })
  @IsNumber()
  @IsOptional()
  locationLat?: number;

  @ApiPropertyOptional({ example: -74.006 })
  @IsNumber()
  @IsOptional()
  locationLng?: number;

  @ApiPropertyOptional({ example: '123 Main St, New York, NY' })
  @IsString()
  @IsOptional()
  locationAddress?: string;

  @ApiPropertyOptional({ description: 'Asset ID to link this task to equipment' })
  @IsString()
  @IsOptional()
  assetId?: string;

  @ApiPropertyOptional({ description: 'Technician ID to assign immediately' })
  @IsString()
  @IsOptional()
  assignedToId?: string;

  @ApiPropertyOptional({ description: 'Start date for the task' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Estimated hours to complete the task', example: 2.5 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(999)
  estimatedHours?: number;

  @ApiPropertyOptional({ description: 'User IDs to assign as team members', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  assigneeIds?: string[];

  @ApiPropertyOptional({ description: 'Open the task to a WORK role in its workspace instead of naming people (shared tasks/role-pool.ts)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  openRoleId?: string;

  @ApiPropertyOptional({ description: 'How many people the role should provide (1–20)', minimum: 1, maximum: ROLE_SPOTS_MAX })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(ROLE_SPOTS_MAX)
  openSpots?: number;

  @ApiPropertyOptional({ description: 'Parent task ID (for creating as a subtask)' })
  @IsString()
  @IsOptional()
  parentId?: string;

  @ApiPropertyOptional({ description: 'Phase ID to associate with' })
  @IsString()
  @IsOptional()
  phaseId?: string;

  @ApiPropertyOptional({ description: 'Sprint ID to associate with' })
  @IsString()
  @IsOptional()
  sprintId?: string;

  @ApiPropertyOptional({ description: 'Epic ID to associate with' })
  @IsString()
  @IsOptional()
  epicId?: string;

  @ApiPropertyOptional({ description: 'Space (CompanyLocation) ID to associate with' })
  @IsString()
  @IsOptional()
  spaceId?: string;

  @ApiPropertyOptional({ description: 'Customer (CRM) ID this task is for' })
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Apartment / unit ID this task is about' })
  @IsString()
  @IsOptional()
  unitId?: string;

  @ApiPropertyOptional({ description: 'Workflow (task type) ID — overrides the space default' })
  @IsString()
  @IsOptional()
  workflowId?: string;

  @ApiPropertyOptional({ description: 'Story points (Fibonacci: 1,2,3,5,8,13,21)', example: 5 })
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(21)
  storyPoints?: number;
}

/**
 * Update task request DTO
 * Inherits all fields from CreateTaskDto but makes them optional
 */
/*
  Everything a create takes except the id: the phone names a task when it
  creates one, and an update must never be able to rename a task.
*/
/*
  ⚠️ The role a task is open to is NOT a plain field: opening, re-sizing and
  closing go through PUT /tasks/:id/open-role, which checks the role, counts who
  already took a place and offers the task. Left in here, a PATCH would write
  the columns raw.
*/
export class UpdateTaskDto extends PartialType(OmitType(CreateTaskDto, ['id', 'openRoleId', 'openSpots'] as const)) {}

/** Open an existing task to a role, change how many it needs, or close it (roleId null). */
export class SetOpenRoleDto {
  @ApiPropertyOptional({ description: 'A WORK role used in the task\'s workspace; null closes it to the role', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(64)
  roleId?: string | null;

  @ApiPropertyOptional({ minimum: 1, maximum: ROLE_SPOTS_MAX })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(ROLE_SPOTS_MAX)
  spots?: number;
}

/** Hand a role task back to its role, with why (optional). */
export class ReturnToRoleDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AssignTaskDto {
  @ApiProperty({ example: 'worker-123' })
  @IsString()
  workerId: string;
}

/** The office starting somebody's job for them: why, and when it really started. */
export class OnBehalfDto {
  @ApiPropertyOptional({ description: 'Why the office is starting it (required by the server when it is somebody else\'s job)' })
  @IsOptional()
  @IsString()
  @MaxLength(OFFICE_START_REASON_MAX)
  reason?: string;

  @ApiPropertyOptional({ description: 'When it really started — inside their shift, not in the future' })
  @IsOptional()
  @IsDateString()
  at?: string;
}

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
    description: 'Step form answers, keyed by field id (note/name/choice/date/signature: string; photos: string[]; number: number; yesno: boolean)',
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

/**
 * "What I did, and what is left" on a job — packages/shared/src/tasks/handover.ts.
 * Also the shape of one note sent with a clock-out.
 */
export class HandoverDto {
  @ApiPropertyOptional({ description: 'Id made on the phone; a retry with the same id returns the same note' })
  @IsOptional()
  @IsString()
  @Matches(CLIENT_ID)
  id?: string;

  @ApiProperty({ description: 'What was done and what is left' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(HANDOVER_NOTE_MAX)
  note!: string;

  @ApiPropertyOptional({ description: "Photos, as the job's own attachment ids", type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(CLIENT_ID, { each: true })
  attachmentIds?: string[];
}

export class ClockOutHandoverDto extends HandoverDto {
  @ApiProperty({ description: 'The job the note is about' })
  @IsString()
  @Matches(CLIENT_ID)
  taskId!: string;
}

export class ResumeWorkDto {
  @ApiPropertyOptional({ type: OccurrenceEvidenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OccurrenceEvidenceDto)
  evidence?: OccurrenceEvidenceDto;
}

// ─── A crew on one job (packages/shared/src/tasks/crew.ts) ───

/** Join a crew job — their own tap, "I'm with him", or the office for somebody (with a reason). */
export class CrewJoinDto {
  @ApiPropertyOptional({ type: OccurrenceEvidenceDto })
  @IsOptional() @ValidateNested() @Type(() => OccurrenceEvidenceDto)
  evidence?: OccurrenceEvidenceDto;

  @ApiPropertyOptional({ description: "Confirming the leader's start: counts from it, within 30 minutes" })
  @IsOptional() @IsBoolean()
  viaLeaderStart?: boolean;

  @ApiPropertyOptional({ description: 'The office joining somebody else (needs a reason)' })
  @IsOptional() @IsString() @Matches(CLIENT_ID)
  forUserId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(CREW_REASON_MAX)
  reason?: string;
}

/** Leave a crew job — their own, or the office for somebody. */
export class CrewLeaveDto {
  @ApiPropertyOptional({ type: OccurrenceEvidenceDto })
  @IsOptional() @ValidateNested() @Type(() => OccurrenceEvidenceDto)
  evidence?: OccurrenceEvidenceDto;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @Matches(CLIENT_ID)
  forUserId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(CREW_REASON_MAX)
  reason?: string;
}

/** "My issue": only the caller's own time is blocked. */
export class CrewIssueDto {
  @ApiProperty({ example: 'Waiting for the pump flange kit' })
  @IsString() @IsNotEmpty() @MaxLength(CREW_REASON_MAX)
  reason: string;

  @ApiPropertyOptional({ type: OccurrenceEvidenceDto })
  @IsOptional() @ValidateNested() @Type(() => OccurrenceEvidenceDto)
  evidence?: OccurrenceEvidenceDto;
}

/** Hand THIS job's lead to somebody already on its crew. */
export class ChangeLeadDto {
  @ApiProperty()
  @IsString() @Matches(CLIENT_ID)
  toUserId: string;

  @ApiProperty({ enum: LEAD_SCOPES })
  @IsIn(LEAD_SCOPES as unknown as string[])
  scope: LeadScope;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(CREW_REASON_MAX)
  reason?: string;
}

// Upload DTOs are shared by every route that stores a file.
export { PresignUploadDto as PresignAttachmentDto, ConfirmUploadDto as ConfirmAttachmentDto } from '../../../common/dto/upload.dto';
