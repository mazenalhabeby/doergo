import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsNumber,
  IsEnum,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { TechnicianType } from '@doergo/shared';

export class CreateTechnicianDto {
  @ApiProperty({
    example: 'john.doe@example.com',
    description: 'Email address (must be unique)',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'John',
    description: 'First name',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(50)
  firstName: string;

  @ApiProperty({
    example: 'Doe',
    description: 'Last name',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(50)
  lastName: string;

  @ApiPropertyOptional({
    example: 'SecurePass123!',
    description: 'Password (optional - system generates if not provided)',
  })
  @IsString()
  @IsOptional()
  @MinLength(8)
  @MaxLength(100)
  password?: string;

  @ApiPropertyOptional({
    enum: TechnicianType,
    example: TechnicianType.FULL_TIME,
    description: 'Employment type',
    default: TechnicianType.FREELANCER,
  })
  @IsEnum(TechnicianType)
  @IsOptional()
  technicianType?: TechnicianType;

  @ApiPropertyOptional({
    example: 'Electrical',
    description: 'Technician specialty (e.g., Electrical, Plumbing, HVAC)',
  })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  specialty?: string;

  @ApiPropertyOptional({
    example: 5,
    description: 'Maximum daily jobs capacity',
    default: 5,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(20)
  maxDailyJobs?: number;
}
