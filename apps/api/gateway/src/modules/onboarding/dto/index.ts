import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, MinLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { INVITATION_CODE_LENGTH, INVITATION_CODE_MIN_LENGTH, ORG_CODE_LENGTH } from '@hbcfield/shared';
import { CompanyNameField } from '@hbcfield/shared';

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

  @ApiPropertyOptional({ example: 'Main Office', description: "Name of the org's first space" })
  @IsOptional()
  @IsString()
  @MaxLength(60, { message: 'Space name must not exceed 60 characters' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  firstSpaceName?: string;
}

/**
 * Submit join request DTO (Path B)
 */
export class SubmitJoinRequestDto {
  @ApiProperty({ example: 'ABCD1234', description: 'Organization join code (8 characters)' })
  @IsString()
  @MinLength(ORG_CODE_LENGTH, { message: `Organization code must be ${ORG_CODE_LENGTH} characters` })
  @MaxLength(ORG_CODE_LENGTH, { message: `Organization code must be ${ORG_CODE_LENGTH} characters` })
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
  @ApiProperty({
    example: 'ABCD23JKLM',
    description: `Invitation code (${INVITATION_CODE_MIN_LENGTH}-${INVITATION_CODE_LENGTH} characters)`,
  })
  @IsString()
  /*
    Bounds from the constant the generator uses, never a literal.

    This cap sat at 8 while codes were issued at 10, so a valid code passed
    validation, showed the right organization on screen, and was refused at the
    moment of joining. The generator moved 6 → 10 in the audit; three separate
    places that RECEIVE a code did not move with it.

    The minimum stays below the current length on purpose: codes issued before
    that change are shorter and must still work.
  */
  @MinLength(INVITATION_CODE_MIN_LENGTH, {
    message: `Invitation code must be at least ${INVITATION_CODE_MIN_LENGTH} characters`,
  })
  @MaxLength(INVITATION_CODE_LENGTH, {
    message: `Invitation code must not exceed ${INVITATION_CODE_LENGTH} characters`,
  })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  code: string;
}
