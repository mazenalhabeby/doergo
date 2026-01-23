import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsDateString, IsNumber, IsNotEmpty, MaxLength } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { TaskStatus, TaskPriority, TASK_TITLE_MAX_LENGTH, TASK_DESCRIPTION_MAX_LENGTH } from '@doergo/shared';

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
  @ApiProperty({ enum: TaskStatus })
  @IsEnum(TaskStatus)
  status: TaskStatus;

  @ApiPropertyOptional({ example: 'Waiting for parts' })
  @IsString()
  @IsOptional()
  reason?: string;
}
