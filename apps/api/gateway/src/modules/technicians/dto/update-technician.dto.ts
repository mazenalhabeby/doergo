import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsBoolean,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { TechnicianType, WorkMode } from '@doergo/shared';

export class UpdateTechnicianDto {
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
    enum: TechnicianType,
    example: TechnicianType.FULL_TIME,
    description: 'Employment type',
  })
  @IsEnum(TechnicianType)
  @IsOptional()
  technicianType?: TechnicianType;

  @ApiPropertyOptional({
    enum: WorkMode,
    example: WorkMode.HYBRID,
    description: 'Work mode (ON_SITE, ON_ROAD, or HYBRID)',
  })
  @IsEnum(WorkMode)
  @IsOptional()
  workMode?: WorkMode;

  @ApiPropertyOptional({
    example: 'Electrical',
    description: 'Technician specialty',
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
    description: 'Whether the technician is active',
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    example: 4.5,
    description: 'Technician rating (1-5)',
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
}
