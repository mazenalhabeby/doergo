import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { EmailField, MaxBytes, BCRYPT_MAX_PASSWORD_BYTES } from '@hbcfield/shared';

export class CreateEmployeeDto {
  @ApiProperty({
    example: 'john.doe@example.com',
    description: 'Email address (must be unique)',
  })
  // The shared rule: valid, ≤255, and LOWERCASED — sign-in lowercases, so an
  // address kept as typed ("Mike@…") could never sign in.
  @EmailField()
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
  // bcrypt reads only the first 72 bytes — refuse more rather than store less.
  @MaxBytes(BCRYPT_MAX_PASSWORD_BYTES, 'Password is too long: use at most 72 bytes (about 72 letters, fewer with accents or emoji)')
  password?: string;

  @ApiPropertyOptional({
    example: 'Electrical',
    description: 'Employee specialty (e.g., Electrical, Plumbing, HVAC)',
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
