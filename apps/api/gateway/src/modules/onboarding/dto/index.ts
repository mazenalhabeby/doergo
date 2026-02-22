import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, MinLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { CompanyNameField } from '@doergo/shared';

/**
 * Create organization DTO (Path A)
 */
export class CreateOrganizationDto {
  @ApiProperty({ example: 'Acme Inc.', description: 'Organization name' })
  @CompanyNameField()
  name: string;

  @ApiPropertyOptional({ example: '123 Business Ave', description: 'Organization address' })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Address must not exceed 200 characters' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  address?: string;

  @ApiPropertyOptional({ example: 'Field Service', description: 'Industry/sector' })
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Industry must not exceed 50 characters' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  industry?: string;
}

/**
 * Submit join request DTO (Path B)
 */
export class SubmitJoinRequestDto {
  @ApiProperty({ example: 'ABCD1234', description: 'Organization join code (8 characters)' })
  @IsString()
  @MinLength(8, { message: 'Organization code must be 8 characters' })
  @MaxLength(8, { message: 'Organization code must be 8 characters' })
  @Matches(/^[A-Z0-9]+$/, { message: 'Organization code must be uppercase alphanumeric' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  orgCode: string;

  @ApiPropertyOptional({ example: 'I am a technician looking to join your team', description: 'Optional message to the organization' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Message must not exceed 500 characters' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  message?: string;
}

/**
 * Accept invitation as existing user DTO (Path C)
 */
export class AcceptInvitationExistingUserDto {
  @ApiProperty({ example: 'ABC123', description: 'Invitation code (6-8 characters)' })
  @IsString()
  @MinLength(6, { message: 'Invitation code must be at least 6 characters' })
  @MaxLength(8, { message: 'Invitation code must not exceed 8 characters' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  code: string;
}
