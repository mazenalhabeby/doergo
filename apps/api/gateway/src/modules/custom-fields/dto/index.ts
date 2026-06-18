import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsBoolean,
  IsInt,
  Min,
  IsEnum,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CustomFieldType } from '@hbcfield/shared';

export class CreateCustomFieldDto {
  @ApiProperty({ example: 'Customer PO Number' })
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'customer_po', description: 'Machine-readable key (lowercase, underscores)' })
  @IsString()
  @IsNotEmpty({ message: 'Key is required' })
  @MaxLength(100)
  key: string;

  @ApiProperty({ enum: CustomFieldType, example: CustomFieldType.TEXT })
  @IsEnum(CustomFieldType)
  type: CustomFieldType;

  @ApiPropertyOptional({
    description: 'Options for DROPDOWN type',
    example: ['Option A', 'Option B'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional({ description: 'Whether this field is required when creating/updating a task', default: false })
  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @ApiPropertyOptional({ description: 'Display order position', example: 0 })
  @IsInt()
  @IsOptional()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({ description: 'Task Type (workflow) this field belongs to; omit for a global field' })
  @IsString()
  @IsOptional()
  workflowId?: string;
}

export class UpdateCustomFieldDto {
  @ApiPropertyOptional({ example: 'Customer PO Number' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({ description: 'Whether the field definition is active' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CustomFieldValueDto {
  @ApiProperty({ description: 'Custom field definition ID' })
  @IsString()
  @IsNotEmpty()
  definitionId: string;

  @ApiProperty({ description: 'Field value (stored as string)', example: 'PO-12345' })
  @IsString()
  value: string;
}

export class SetCustomFieldValuesDto {
  @ApiProperty({ type: [CustomFieldValueDto], description: 'Array of field values to set' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomFieldValueDto)
  values: CustomFieldValueDto[];
}
