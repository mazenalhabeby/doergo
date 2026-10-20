import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsIn,
  Min,
  Max,
  MinLength,
  MaxLength,
  Matches,
  IsInt,
  ValidateIf,
} from 'class-validator';

export class UpdateMemberDto {
  /*
    ⚠️ These three were missing, so with forbidNonWhitelisted every save of a
    member's cost rate from the edit dialog was refused with "property
    costRateCents should not exist". The service always handled them.
  */
  @ApiPropertyOptional({ description: 'What this person bills per hour, in cents. Null inherits; 0 is a real rate.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(1000000)
  billRateCents?: number | null;

  @ApiPropertyOptional({ description: 'What this person costs per hour, in cents. Needs canViewLabourCost.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(1000000)
  costRateCents?: number | null;

  @ApiPropertyOptional({ description: 'What a DAY of this person costs, in cents. Needs canViewLabourCost.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(1000000)
  costDayCents?: number | null;

  @ApiPropertyOptional({ description: 'First day a changed rate applies, YYYY-MM-DD. Default today; earlier work keeps its rate.' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  rateEffectiveFrom?: string;

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
    example: 'IN_HOUSE',
    enum: ['IN_HOUSE', 'EXTERNAL'],
    description: 'Employment relationship — drives the field seat price (IN_HOUSE €9 / EXTERNAL €15)',
  })
  @IsString()
  @IsOptional()
  @IsIn(['IN_HOUSE', 'EXTERNAL'])
  employmentType?: string;

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
