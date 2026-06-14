import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty, MaxLength, IsDateString, IsInt, Min } from 'class-validator';

export class CreateSprintDto {
  @ApiProperty({ example: 'Sprint 1' })
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Complete core features' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  goal?: string;

  @ApiProperty({ description: 'Sprint start date (ISO string)' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'Sprint end date (ISO string)' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ description: 'Display order position', example: 0 })
  @IsInt()
  @IsOptional()
  @Min(0)
  position?: number;
}

export class UpdateSprintDto {
  @ApiPropertyOptional({ example: 'Sprint 1' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: 'Complete core features' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  goal?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Min(0)
  position?: number;
}
