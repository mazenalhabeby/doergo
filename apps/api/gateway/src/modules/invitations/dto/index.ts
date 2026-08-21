import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsArray,
  IsBoolean,
  ValidateNested,
  Min,
  Max,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { EmailField, StrongPasswordField, NameField } from '@hbcfield/shared';

export class InvitationScheduleEntryDto {
  @IsNumber()
  dayOfWeek: number;

  @IsString()
  startTime: string;

  @IsString()
  endTime: string;

  @IsBoolean()
  isActive: boolean;
}

// ── Access Profile (pre-configured on the invite, applied on accept) ──────────
// Mirrors the AccessPersisted shape produced by `serializeAccessDraft`. Values
// are re-sanitized server-side via `normalizeAccessProfile`, so this validation
// is a first line of defence, not the only one.

export class EnabledModulesDto {
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  modules?: string[];

  @IsOptional()
  @IsIn(['web', 'mobile', 'both'])
  platforms?: string;

  @IsOptional()
  @IsIn(['own', 'tasks', 'all'])
  spaceScope?: string;

  @IsOptional()
  @IsBoolean()
  canContact?: boolean;
}

export class AccessProfileDto {
  // serializeAccessDraft() always emits memberRoleId (a value or null) as the
  // first field of the persisted access blob. Declare it here so the global
  // forbidNonWhitelisted pipe doesn't reject the nested property. The real role
  // is still taken from the validated top-level CreateInvitationDto.memberRoleId;
  // normalizeAccessProfile() forces this nested copy to null server-side.
  @IsOptional() @IsString() memberRoleId?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => EnabledModulesDto)
  enabledModules?: EnabledModulesDto;

  @IsOptional() @IsBoolean() canCreateTasks?: boolean;

  @IsOptional() @IsIn(['NONE', 'SELF', 'SPACE', 'ORG']) taskCreationScope?: string;

  @IsOptional() @IsBoolean() canAssignTasks?: boolean;

  @IsOptional() @IsBoolean() canViewAllTasks?: boolean;

  @IsOptional() @IsBoolean() canManageUsers?: boolean;

  @IsOptional() @IsBoolean() contactable?: boolean;

  @IsOptional() @IsIn(['NONE', 'ALL', 'SELECTED']) contactScope?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) contactAllowedIds?: string[];

  @IsOptional() @IsBoolean() canViewReports?: boolean;

  @IsOptional() @IsBoolean() allowRemote?: boolean;
}

export class CreateInvitationDto {
  @ApiProperty({
    enum: ['ADMIN', 'EMPLOYEE', 'CUSTOMER'],
    description: 'Role for the invitee',
  })
  @IsString()
  @IsEnum(['ADMIN', 'EMPLOYEE', 'CUSTOMER'], {
    message: 'Target role must be EMPLOYEE or CUSTOMER',
  })
  targetRole: string;

  @ApiPropertyOptional({
    example: 'john@example.com',
    description: 'Email to send the invitation to',
  })
  @IsString()
  @IsOptional()
  email?: string;

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
    example: 'technician',
    description: 'Position (only for TECHNICIAN role)',
  })
  @IsString()
  @IsOptional()
  position?: string;

  @ApiPropertyOptional({
    example: 'FIXED',
    description: 'Schedule type to pre-set on the member (NONE | FIXED | FLEXIBLE)',
  })
  @IsString()
  @IsOptional()
  @IsIn(['NONE', 'FIXED', 'FLEXIBLE'])
  scheduleType?: string;

  @ApiPropertyOptional({ type: [InvitationScheduleEntryDto], description: 'Weekly hours when scheduleType=FIXED' })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => InvitationScheduleEntryDto)
  schedule?: InvitationScheduleEntryDto[];

  @ApiPropertyOptional({ example: 160, description: 'Monthly hour budget when scheduleType=FLEXIBLE' })
  @IsNumber()
  @IsOptional()
  monthlyHourBudget?: number;

  @ApiPropertyOptional({
    example: 'Electrical',
    description: 'Technician specialty',
  })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  specialty?: string;

  @ApiPropertyOptional({ description: 'Pre-assigned space (CompanyLocation id)' })
  @IsString()
  @IsOptional()
  spaceId?: string;

  @ApiPropertyOptional({ description: 'Pre-assigned org role (AccessRole id) applied on accept' })
  @IsString()
  @IsOptional()
  memberRoleId?: string;

  @ApiPropertyOptional({
    type: AccessProfileDto,
    description: 'Pre-configured Access Profile applied to the member on accept',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AccessProfileDto)
  accessProfile?: AccessProfileDto;

  // Customer-portal invite (only for targetRole=CUSTOMER)

  @ApiPropertyOptional({ description: 'Customer this portal login is bound to (required when targetRole=CUSTOMER)' })
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Default unit for the customer login (optional)' })
  @IsString()
  @IsOptional()
  unitId?: string;

  @ApiPropertyOptional({ description: 'Default asset for the customer login (optional)' })
  @IsString()
  @IsOptional()
  assetId?: string;

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
