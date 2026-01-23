import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

class PartUsedDto {
  @ApiProperty({ description: 'Name of the part', example: 'Air Filter' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Part number/SKU', example: 'AF-2024-A' })
  @IsString()
  @IsOptional()
  partNumber?: string;

  @ApiProperty({ description: 'Quantity used', example: 1, default: 1 })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ description: 'Cost per unit', example: 25.99 })
  @IsNumber()
  @IsOptional()
  unitCost?: number;

  @ApiPropertyOptional({ description: 'Additional notes', example: 'Replaced due to wear' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CompleteTaskDto {
  @ApiProperty({
    description: 'Brief summary of work done',
    example: 'Replaced compressor and recharged refrigerant',
  })
  @IsString()
  @IsNotEmpty()
  summary: string;

  @ApiPropertyOptional({
    description: 'Detailed description of work performed',
    example: '1. Diagnosed faulty compressor\n2. Removed old unit\n3. Installed replacement',
  })
  @IsString()
  @IsOptional()
  workPerformed?: string;

  @ApiProperty({
    description: 'Duration of work in seconds',
    example: 5400,
  })
  @IsNumber()
  @Min(0)
  workDuration: number;

  @ApiPropertyOptional({
    description: 'Technician signature as base64 encoded PNG',
    example: 'data:image/png;base64,...',
  })
  @IsString()
  @IsOptional()
  technicianSignature?: string;

  @ApiPropertyOptional({
    description: 'Customer signature as base64 encoded PNG',
    example: 'data:image/png;base64,...',
  })
  @IsString()
  @IsOptional()
  customerSignature?: string;

  @ApiPropertyOptional({
    description: 'Name of customer who signed',
    example: 'John Smith',
  })
  @IsString()
  @IsOptional()
  customerName?: string;

  @ApiPropertyOptional({
    description: 'List of parts used during the service',
    type: [PartUsedDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartUsedDto)
  @IsOptional()
  partsUsed?: PartUsedDto[];
}
