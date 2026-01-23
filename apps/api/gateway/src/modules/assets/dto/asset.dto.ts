import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsNumber,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { AssetStatus } from '@doergo/shared';

export class CreateAssetDto {
  @ApiProperty({ example: 'Rooftop HVAC Unit #1', description: 'Asset name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'AC-2024-001234', description: 'Serial number' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  serialNumber?: string;

  @ApiPropertyOptional({ example: 'Carrier 50XC', description: 'Model name/number' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  model?: string;

  @ApiPropertyOptional({ example: 'Carrier', description: 'Manufacturer name' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  manufacturer?: string;

  @ApiPropertyOptional({ enum: AssetStatus, default: 'ACTIVE' })
  @IsEnum(AssetStatus)
  @IsOptional()
  status?: AssetStatus;

  @ApiPropertyOptional({ example: '2024-03-15', description: 'Installation date' })
  @IsDateString()
  @IsOptional()
  installDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Warranty expiry date' })
  @IsDateString()
  @IsOptional()
  warrantyExpiry?: string;

  @ApiPropertyOptional({ example: '123 Main St, Building A, Roof' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  locationAddress?: string;

  @ApiPropertyOptional({ example: 40.7128 })
  @IsNumber()
  @IsOptional()
  locationLat?: number;

  @ApiPropertyOptional({ example: -74.006 })
  @IsNumber()
  @IsOptional()
  locationLng?: number;

  @ApiPropertyOptional({ example: 'Installed during Q1 2024 renovation' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Category ID' })
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Type ID (must belong to the category)' })
  @IsString()
  @IsOptional()
  typeId?: string;
}

export class UpdateAssetDto extends PartialType(CreateAssetDto) {}

export class AssetQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Filter by category ID' })
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Filter by type ID' })
  @IsString()
  @IsOptional()
  typeId?: string;

  @ApiPropertyOptional({ enum: AssetStatus, description: 'Filter by status' })
  @IsEnum(AssetStatus)
  @IsOptional()
  status?: AssetStatus;

  @ApiPropertyOptional({ description: 'Search by name, serial, model, or manufacturer' })
  @IsString()
  @IsOptional()
  search?: string;
}
