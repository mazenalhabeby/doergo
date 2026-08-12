import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsDateString, IsNumber, IsNotEmpty, MaxLength, IsArray, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { TaskPriority, TaskAssigneeRole, DependencyType, TASK_TITLE_MAX_LENGTH, TASK_DESCRIPTION_MAX_LENGTH } from '@hbcfield/shared';

/**
 * Create task request DTO
 */
export class CreateTaskDto {
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
export class UpdateTaskDto extends PartialType(CreateTaskDto) {}

export class AssignTaskDto {
  @ApiProperty({ example: 'worker-123' })
  @IsString()
  workerId: string;
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
  @ApiProperty({ description: 'Comment text', example: 'Looks good to me' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;
}
