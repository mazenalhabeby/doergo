import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsNumber,
  IsEnum,
  IsDateString,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AssetStatus } from '@hbcfield/shared';

/**
 * One filled-in field on a record.
 *
 * This is a real class, not `unknown[]`, and it has to stay one. With
 * `transform + enableImplicitConversion` on the global pipe, an array property
 * with no element type gets each element coerced to the declared type — which
 * turned `{ label, value }` into `[]`, validated, returned 200 and stored
 * nothing. Silent data loss with a success toast on top.
 */
export class AssetDetailRowDto {
  @ApiProperty({ example: 'Door code' })
  @IsString()
  @MaxLength(60)
  label: string;

  @ApiPropertyOptional({ example: '1234' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  value?: string;
}

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
  @ApiPropertyOptional({ description: 'Member who holds this (clears any client)' })
  @IsString()
  @IsOptional()
  holderUserId?: string | null;

  @ApiPropertyOptional({ description: 'Client who holds this (clears any member)' })
  @IsString()
  @IsOptional()
  customerId?: string | null;

  // Values for the fields this record's KIND asks for. The element type is
  // declared so the pipe rebuilds real rows; normalizeDetailRows() in
  // task-service remains the authority on what is kept.
  @ApiPropertyOptional({ type: [AssetDetailRowDto], description: 'Filled-in fields' })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AssetDetailRowDto)
  details?: AssetDetailRowDto[];

}

export class UpdateAssetDto extends PartialType(CreateAssetDto) {}

/**
 * One row of a table on a record.
 *
 * `values` is a real object of strings, declared so the pipe rebuilds it — the
 * same trap that flattened `details` into [] applies to anything the pipe
 * cannot see the shape of.
 */
export class AssetListRowDto {
  @ApiProperty({ example: 'Parts' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  list: string;

  @ApiProperty({ example: { Code: 'HYD-8842', Name: 'Seal kit', Qty: '2' } })
  @IsObject()
  values: Record<string, string>;
}

export class UpdateAssetListRowDto {
  @ApiProperty({ example: { Code: 'HYD-8842' } })
  @IsObject()
  values: Record<string, string>;
}

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
