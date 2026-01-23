import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';

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
}

export class UpdateAssetCategoryDto extends PartialType(CreateAssetCategoryDto) {}
