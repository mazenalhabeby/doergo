import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';

export class CreateAssetTypeDto {
  @ApiProperty({ example: 'Air Conditioner', description: 'Type name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Central and split air conditioning units' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}

export class UpdateAssetTypeDto extends PartialType(CreateAssetTypeDto) {}
