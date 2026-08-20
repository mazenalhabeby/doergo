import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength, IsOptional, IsObject } from 'class-validator';

export class CreateAssetCategoryDto {
  @ApiProperty({ example: 'HVAC', description: 'Category name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Heating, ventilation, and air conditioning equipment' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'thermometer', description: 'Icon name for UI' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  icon?: string;

  @ApiPropertyOptional({ example: '#3b82f6', description: 'Badge color (hex)' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  color?: string;

  @ApiPropertyOptional({ description: 'The space this kind belongs to' })
  @IsString()
  @IsOptional()
  spaceId?: string;

  // Shape of this kind's records (name label, address, holder, fields). Passed
  // through as an object: normalizeKindShape() in task-service is the authority
  // on what is acceptable, so validating the inner structure twice would only
  // give two places to disagree.
  @ApiPropertyOptional({ description: "What this kind's records look like" })
  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;
}

export class UpdateAssetCategoryDto extends PartialType(CreateAssetCategoryDto) {}
