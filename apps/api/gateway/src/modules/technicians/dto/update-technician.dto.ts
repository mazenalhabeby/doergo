import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';

export class UpdateEmployeeDto {
  @ApiPropertyOptional({
    example: 'John',
    description: 'First name',
  })
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(50)
  firstName?: string;

  @ApiPropertyOptional({
    example: 'Doe',
    description: 'Last name',
  })
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(50)
  lastName?: string;

  @ApiPropertyOptional({
    example: 'Electrical',
    description: 'Employee specialty',
  })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  specialty?: string;

  @ApiPropertyOptional({
    example: 5,
    description: 'Maximum daily jobs capacity',
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(20)
  maxDailyJobs?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the employee is active',
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    example: 4.5,
    description: 'Employee rating (1-5)',
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Number of ratings received',
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  ratingCount?: number;

  @ApiPropertyOptional({
    example: false,
    description: 'Whether the employee can create tasks',
  })
  @IsBoolean()
  @IsOptional()
  canCreateTasks?: boolean;

  @ApiPropertyOptional({
    description: 'Profile badge visibility override (null to use org defaults)',
  })
  @IsOptional()
  profileBadges?: any;
}
