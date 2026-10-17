/** Moved here unchanged from dto/index.ts. */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { CLIENT_ID } from '../../../../common/dto/upload.dto';
import {
  OFFICE_START_REASON_MAX,
  ROLE_SPOTS_MAX,
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_TITLE_MAX_LENGTH,
  TaskPriority,
} from '@hbcfield/shared';
import { OmitType, PartialType } from '@nestjs/mapped-types';

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

  @ApiPropertyOptional({
    description:
      'Open the task to a WORK role in its workspace instead of naming people ' + '(shared tasks/role-pool.ts)',
  })
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
