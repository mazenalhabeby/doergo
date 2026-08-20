import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty, MaxLength, IsBoolean, IsDateString, IsInt, Min } from 'class-validator';

export class CreatePhaseDto {
  @ApiPropertyOptional({
    description: 'The space this belongs to. Omit for one the whole organization shares.',
  })
  @IsString()
  @IsOptional()
  @MaxLength(40)
  spaceId?: string;

  @ApiProperty({ example: 'Phase 1: Foundation' })
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Initial setup and groundwork' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: '#3b82f6', description: 'Hex color for the phase' })
  @IsString()
  @IsOptional()
  color?: string;

  @ApiPropertyOptional({ example: 'phase', description: 'Type: "phase" or "milestone"' })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO string)' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO string)' })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Display order position', example: 0 })
  @IsInt()
  @IsOptional()
  @Min(0)
  position?: number;
}

export class UpdatePhaseDto {
  @ApiPropertyOptional({ example: 'Phase 1: Foundation' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: 'Initial setup and groundwork' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: '#3b82f6' })
  @IsString()
  @IsOptional()
  color?: string;

  @ApiPropertyOptional({ example: 'phase' })
  @IsString()
  @IsOptional()
  type?: string;

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

  @ApiPropertyOptional({ description: 'Whether the phase is active' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
