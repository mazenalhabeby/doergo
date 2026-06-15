import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsBoolean,
  IsInt,
  Min,
  IsArray,
  IsIn,
  ValidateNested,
} from 'class-validator';

const TASK_CAPABILITIES = ['gps', 'timer', 'checklist', 'photos', 'signature', 'report', 'form'];
import { Type } from 'class-transformer';

// ==================== Workflow DTOs ====================

export class CreateWorkflowDto {
  @ApiProperty({ example: 'Field Service' })
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: 'Set as default workflow for new tasks', default: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class UpdateWorkflowDto {
  @ApiPropertyOptional({ example: 'Field Service v2' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'Whether the workflow is active' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// ==================== Workflow Status DTOs ====================

export class CreateWorkflowStatusDto {
  @ApiProperty({ example: 'In Transit', description: 'Display name of the status' })
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'IN_TRANSIT', description: 'Machine-readable key (uppercase, underscores)' })
  @IsString()
  @IsNotEmpty({ message: 'Key is required' })
  @MaxLength(50)
  key: string;

  @ApiPropertyOptional({ example: '#3b82f6', description: 'Hex color for the status badge' })
  @IsString()
  @IsOptional()
  color?: string;

  @ApiPropertyOptional({ example: 'truck', description: 'Lucide icon name' })
  @IsString()
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional({ example: 0, description: 'Display order position' })
  @IsInt()
  @IsOptional()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({ description: 'Whether this status marks a completed task', default: false })
  @IsBoolean()
  @IsOptional()
  isFinal?: boolean;

  @ApiPropertyOptional({ description: 'Whether this status marks a canceled task', default: false })
  @IsBoolean()
  @IsOptional()
  isCanceled?: boolean;

  @ApiPropertyOptional({
    description: 'Array of status keys this status can transition to',
    example: ['IN_PROGRESS', 'CANCELED'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  transitions?: string[];

  @ApiPropertyOptional({ description: 'Execution widgets active at this step', example: ['gps', 'timer'], type: [String] })
  @IsArray()
  @IsIn(TASK_CAPABILITIES, { each: true })
  @IsOptional()
  capabilities?: string[];
}

export class UpdateWorkflowStatusDto {
  @ApiPropertyOptional({ example: 'In Transit' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: '#3b82f6' })
  @IsString()
  @IsOptional()
  color?: string;

  @ApiPropertyOptional({ example: 'truck' })
  @IsString()
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Min(0)
  position?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isFinal?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isCanceled?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  transitions?: string[];

  @ApiPropertyOptional({ description: 'Execution widgets active at this step', example: ['gps', 'timer'], type: [String] })
  @IsArray()
  @IsIn(TASK_CAPABILITIES, { each: true })
  @IsOptional()
  capabilities?: string[];
}

// ==================== Definition of Done DTOs ====================

export class DodItemDto {
  @ApiProperty({ example: 'Code review completed' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  text: string;

  @ApiProperty({ example: true, description: 'Whether this item is mandatory' })
  @IsBoolean()
  isRequired: boolean;
}

export class UpsertDefinitionOfDoneDto {
  @ApiPropertyOptional({ description: 'Existing DoD ID to update (omit to create new)' })
  @IsString()
  @IsOptional()
  id?: string;

  @ApiPropertyOptional({ description: 'Optional workflow ID to tie this DoD to a specific workflow' })
  @IsString()
  @IsOptional()
  workflowId?: string;

  @ApiProperty({ description: 'Array of DoD items', type: [DodItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DodItemDto)
  items: DodItemDto[];

  @ApiPropertyOptional({ description: 'Whether this DoD is active', default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
