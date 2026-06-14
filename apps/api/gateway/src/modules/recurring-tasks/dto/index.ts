import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsDateString,
  IsNumber,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RecurrenceFrequency, TaskPriority } from '@hbcfield/shared';

class ChecklistItemInput {
  @ApiProperty({ example: 'Check oil level' })
  @IsString()
  @IsNotEmpty()
  text: string;
}

export class CreateRecurringTaskDto {
  @ApiProperty({ example: 'Weekly Equipment Inspection' })
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(500)
  title: string;

  @ApiPropertyOptional({ example: 'Inspect all equipment in Building A' })
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ enum: TaskPriority, example: TaskPriority.MEDIUM })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

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

  @ApiPropertyOptional({ description: 'Array of user IDs to assign', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  assigneeIds?: string[];

  @ApiPropertyOptional({ example: 2.5 })
  @IsNumber()
  @IsOptional()
  estimatedHours?: number;

  @ApiPropertyOptional({ description: 'Checklist items', type: [ChecklistItemInput] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemInput)
  @IsOptional()
  checklist?: ChecklistItemInput[];

  @ApiProperty({ enum: RecurrenceFrequency, example: RecurrenceFrequency.WEEKLY })
  @IsEnum(RecurrenceFrequency)
  frequency: RecurrenceFrequency;

  @ApiPropertyOptional({ description: 'For CUSTOM frequency: every N days', example: 10 })
  @IsInt()
  @IsOptional()
  @Min(1)
  customDays?: number;

  @ApiPropertyOptional({ description: 'For WEEKLY/BIWEEKLY: day of week (0=Sun, 6=Sat)', example: 1 })
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ApiPropertyOptional({ description: 'For MONTHLY: day of month (1-31)', example: 15 })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @ApiProperty({ description: 'When to start generating tasks (ISO string)' })
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({ description: 'When to stop generating tasks (ISO string, null = forever)' })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}

export class UpdateRecurringTaskDto {
  @ApiPropertyOptional({ example: 'Weekly Equipment Inspection' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ enum: TaskPriority })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  locationLat?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  locationLng?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  locationAddress?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  assigneeIds?: string[];

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  estimatedHours?: number;

  @ApiPropertyOptional({ type: [ChecklistItemInput] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemInput)
  @IsOptional()
  checklist?: ChecklistItemInput[];

  @ApiPropertyOptional({ enum: RecurrenceFrequency })
  @IsEnum(RecurrenceFrequency)
  @IsOptional()
  frequency?: RecurrenceFrequency;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Min(1)
  customDays?: number;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Whether the template is active' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
