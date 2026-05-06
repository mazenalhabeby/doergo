import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ListTechniciansDto {
  @ApiPropertyOptional({
    enum: ['active', 'inactive', 'all'],
    example: 'active',
    description: 'Filter by status',
    default: 'active',
  })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'all'])
  status?: 'active' | 'inactive' | 'all';

  @ApiPropertyOptional({
    example: 'all',
    description: 'Filter by work mode',
    default: 'all',
  })
  @IsOptional()

  @ApiPropertyOptional({
    example: 'Electrical',
    description: 'Filter by specialty (partial match)',
  })
  @IsString()
  @IsOptional()
  specialty?: string;

  @ApiPropertyOptional({
    example: 'john',
    description: 'Search by name or email',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Page number',
    default: 1,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Items per page',
    default: 10,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    enum: ['name', 'email', 'rating', 'taskCount', 'createdAt'],
    example: 'name',
    description: 'Sort field',
    default: 'name',
  })
  @IsOptional()
  @IsEnum(['name', 'email', 'rating', 'taskCount', 'createdAt'])
  sortBy?: 'name' | 'email' | 'rating' | 'taskCount' | 'createdAt';

  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    example: 'asc',
    description: 'Sort order',
    default: 'asc',
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
