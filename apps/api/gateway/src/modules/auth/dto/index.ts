import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsNotEmpty,
} from 'class-validator';
import { Transform } from 'class-transformer';

// Sanitize string: trim whitespace, convert to lowercase where appropriate
const sanitizeString = (value: string) => (typeof value === 'string' ? value.trim() : value);
const toLowercase = (value: string) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

// Name validation regex: only letters, spaces, hyphens, and apostrophes
const NAME_REGEX = /^[a-zA-Z\s\-']+$/;
// Company name regex: letters, numbers, spaces, and common punctuation
const COMPANY_REGEX = /^[a-zA-Z0-9\s\-'&.,]+$/;
// Password regex: at least one uppercase, one lowercase, one number
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

export class LoginDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  @IsEmail({}, { message: 'Please enter a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  @MaxLength(255, { message: 'Email must not exceed 255 characters' })
  @Transform(({ value }) => toLowercase(value))
  email: string;

  @ApiProperty({ example: 'Password123', description: 'User password' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  password: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  @IsEmail({}, { message: 'Please enter a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  @MaxLength(255, { message: 'Email must not exceed 255 characters' })
  @Transform(({ value }) => toLowercase(value))
  email: string;

  @ApiProperty({ example: 'Password123', description: 'Password (min 8 chars, must include uppercase, lowercase, and number)' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  @Matches(PASSWORD_REGEX, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password: string;

  @ApiProperty({ example: 'John', description: 'First name' })
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  @MinLength(2, { message: 'First name must be at least 2 characters' })
  @MaxLength(50, { message: 'First name must not exceed 50 characters' })
  @Matches(NAME_REGEX, { message: 'First name can only contain letters, spaces, hyphens, and apostrophes' })
  @Transform(({ value }) => toLowercase(value))
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'Last name' })
  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  @MinLength(2, { message: 'Last name must be at least 2 characters' })
  @MaxLength(50, { message: 'Last name must not exceed 50 characters' })
  @Matches(NAME_REGEX, { message: 'Last name can only contain letters, spaces, hyphens, and apostrophes' })
  @Transform(({ value }) => toLowercase(value))
  lastName: string;

  @ApiProperty({ example: 'Acme Inc.', description: 'Company name' })
  @IsString()
  @IsNotEmpty({ message: 'Company name is required' })
  @MinLength(2, { message: 'Company name must be at least 2 characters' })
  @MaxLength(100, { message: 'Company name must not exceed 100 characters' })
  @Matches(COMPANY_REGEX, { message: 'Company name contains invalid characters' })
  @Transform(({ value }) => toLowercase(value))
  companyName: string;

  // NOTE: Role is NOT accepted from user input - always set to PARTNER on backend
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token for getting new access token' })
  @IsString()
  @IsNotEmpty({ message: 'Refresh token is required' })
  refreshToken: string;
}
