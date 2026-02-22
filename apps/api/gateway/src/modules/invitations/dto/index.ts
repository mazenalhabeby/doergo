import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { EmailField, StrongPasswordField, NameField } from '@doergo/shared';

export class CreateInvitationDto {
  @ApiProperty({
    enum: ['DISPATCHER', 'TECHNICIAN'],
    description: 'Role for the invitee',
  })
  @IsString()
  @IsEnum(['DISPATCHER', 'TECHNICIAN'], {
    message: 'Target role must be DISPATCHER or TECHNICIAN',
  })
  targetRole: string;

  @ApiPropertyOptional({
    example: 72,
    description: 'Expiry in hours (default: 72, max: 720)',
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(720)
  expiresInHours?: number;

  // Technician-specific fields
  @ApiPropertyOptional({
    enum: ['FREELANCER', 'FULL_TIME'],
    description: 'Technician type (only for TECHNICIAN role)',
  })
  @IsString()
  @IsOptional()
  @IsEnum(['FREELANCER', 'FULL_TIME'])
  technicianType?: string;

  @ApiPropertyOptional({
    enum: ['ON_SITE', 'ON_ROAD', 'HYBRID'],
    description: 'Work mode (only for TECHNICIAN role)',
  })
  @IsString()
  @IsOptional()
  @IsEnum(['ON_SITE', 'ON_ROAD', 'HYBRID'])
  workMode?: string;

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
    description: 'Maximum daily jobs for technician',
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(20)
  maxDailyJobs?: number;
}

export class AcceptInvitationDto {
  @ApiProperty({
    example: 'XK7M2P',
    description: 'Invitation code (6 characters)',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(8)
  @Matches(/^[A-Za-z0-9]+$/, { message: 'Code must be alphanumeric' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase().trim() : value,
  )
  code: string;

  @ApiProperty({ example: 'user@example.com' })
  @EmailField()
  email: string;

  @ApiProperty({ example: 'Password123' })
  @StrongPasswordField()
  password: string;

  @ApiProperty({ example: 'John' })
  @NameField('First name', { capitalize: true })
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @NameField('Last name', { capitalize: true })
  lastName: string;
}

export class ListInvitationsDto {
  @ApiPropertyOptional({
    enum: ['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED', 'all'],
    default: 'all',
  })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;
}
