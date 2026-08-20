import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty, MaxLength, IsDateString, IsInt, IsEnum, Min } from 'class-validator';

export class CreateEpicDto {
  @ApiPropertyOptional({
    description: 'The space this belongs to. Omit for one the whole organization shares.',
  })
  @IsString()
  @IsOptional()
  @MaxLength(40)
  spaceId?: string;

  @ApiProperty({ example: 'User Authentication' })
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'All authentication-related tasks' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: '#8b5cf6', description: 'Hex color for the epic' })
  @IsString()
  @IsOptional()
  color?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO string)' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Target date (ISO string)' })
  @IsDateString()
  @IsOptional()
  targetDate?: string;

  @ApiPropertyOptional({ description: 'Display order position', example: 0 })
  @IsInt()
  @IsOptional()
  @Min(0)
  position?: number;
}

export class UpdateEpicDto {
  @ApiPropertyOptional({ example: 'User Authentication' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: 'All authentication-related tasks' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: '#8b5cf6' })
  @IsString()
  @IsOptional()
  color?: string;

  @ApiPropertyOptional({ description: 'Status: OPEN, IN_PROGRESS, DONE' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  targetDate?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Min(0)
  position?: number;
}
