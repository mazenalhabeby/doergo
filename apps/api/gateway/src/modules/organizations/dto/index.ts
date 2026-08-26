import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsBoolean, IsNumber, IsArray, IsEmail, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';

/**
 * Update organization settings DTO
 */
export class UpdateOrgSettingsDto {
  @ApiProperty({ enum: ['OPEN', 'INVITE_ONLY', 'CLOSED'], description: 'Join policy' })
  @IsEnum(['OPEN', 'INVITE_ONLY', 'CLOSED'], { message: 'Join policy must be OPEN, INVITE_ONLY, or CLOSED' })
  joinPolicy: string;
}

/**
 * Invite by email DTO
 */
export class InviteByEmailDto {
  @ApiProperty({ example: 'user@example.com', description: 'Email of existing user to invite' })
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email: string;
}

/**
 * Query params for listing members
 */
export class ListMembersQueryDto {
  @ApiPropertyOptional({ description: 'Search by name or email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['ADMIN', 'EMPLOYEE'], description: 'Filter by role' })
  @IsOptional()
  @IsEnum(['ADMIN', 'EMPLOYEE'])
  role?: string;

  @ApiPropertyOptional({ description: 'Only admins and managers (by role), for leadership pickers' })
  @IsOptional()
  managersOnly?: boolean;

  @ApiPropertyOptional({ description: 'Member id to leave out of the result' })
  @IsOptional()
  @IsString()
  excludeId?: string;

  @ApiPropertyOptional({ description: 'Directory projection only — identity and presence, no permissions or profile' })
  @IsOptional()
  lite?: boolean;

  @ApiPropertyOptional({ description: 'Comma-separated ids to keep in the result even if they no longer qualify' })
  @IsOptional()
  @IsString()
  includeIds?: string;

  @ApiPropertyOptional({ description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page (max 200)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(200)
  limit?: number;
}

/**
 * Update member profile, role, and permissions DTO
 */
/**
 * Update organization profile DTO — explicitly allowlisted fields
 */
export class UpdateOrgProfileDto {
  @ApiPropertyOptional({ description: 'Organization name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Industry' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ description: 'Org distinguishes in-house vs external field workers' })
  @IsOptional()
  @IsBoolean()
  usesExternalWorkers?: boolean;

  @ApiPropertyOptional({ description: 'Address (legacy single line)' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Street address' })
  @IsOptional()
  @IsString()
  addressLine1?: string;

  @ApiPropertyOptional({ description: 'Address line 2 (suite/floor)' })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiPropertyOptional({ description: 'City' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'State / province / region' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ description: 'Postal / ZIP code' })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional({ description: 'Country (ISO 3166-1 alpha-2)' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Contact email' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: 'Website URL' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ description: 'Timezone (e.g. America/New_York)' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ description: 'Logo URL' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'VAT / UID number (shown on invoices)' })
  @IsOptional()
  @IsString()
  vatId?: string;

  @ApiPropertyOptional({ description: 'Default billable labor rate charged to customers, in EUR cents/hour (0 or null clears)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000000)
  billableRateCents?: number;

  @ApiPropertyOptional({ description: 'Enabled modules', type: [String] })
  @IsOptional()
  @IsString({ each: true })
  enabledModules?: string[];
}

/**
 * Update notification preferences DTO
 */
export class UpdateNotificationPrefsDto {
  @ApiPropertyOptional({ description: 'Email notifications enabled' })
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Push notifications enabled' })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Notify on task assigned' })
  @IsOptional()
  @IsBoolean()
  taskAssigned?: boolean;

  @ApiPropertyOptional({ description: 'Notify on task status change' })
  @IsOptional()
  @IsBoolean()
  taskStatusChanged?: boolean;

  @ApiPropertyOptional({ description: 'Notify on new comment' })
  @IsOptional()
  @IsBoolean()
  commentAdded?: boolean;

  @ApiPropertyOptional({ description: 'Notify on join request' })
  @IsOptional()
  @IsBoolean()
  joinRequestReceived?: boolean;
}

/**
 * Update security settings DTO
 */
export class UpdateSecuritySettingsDto {
  @ApiPropertyOptional({ description: 'Max failed login attempts before lockout' })
  @IsOptional()
  @IsNumber()
  maxFailedAttempts?: number;

  @ApiPropertyOptional({ description: 'Lockout duration in minutes' })
  @IsOptional()
  @IsNumber()
  lockoutDurationMinutes?: number;

  @ApiPropertyOptional({ description: 'Require 2FA for admins' })
  @IsOptional()
  @IsBoolean()
  require2FA?: boolean;

  @ApiPropertyOptional({ description: 'Session timeout in minutes' })
  @IsOptional()
  @IsNumber()
  sessionTimeoutMinutes?: number;

  @ApiPropertyOptional({ description: 'Max concurrent sessions per user' })
  @IsOptional()
  @IsNumber()
  maxConcurrentSessions?: number;
}

/**
 * Update member profile, role, and permissions DTO
 */
export class UpdateMemberDto {
  @ApiPropertyOptional({ description: "Annual vacation days for this member. Null = use the organization's default; 0 = no paid leave." })
  @IsOptional()
  leaveAllowance?: number | null;

  @ApiPropertyOptional({ description: 'The date this person started working here (YYYY-MM-DD). Pro-rates their first year.' })
  @IsOptional()
  @IsString()
  employmentStartDate?: string | null;

  @ApiPropertyOptional({ description: 'Login email (must be unique across all users)' })
  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email?: string;

  @ApiPropertyOptional({ description: 'First name' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Position/title (e.g., Technician, Driver, Office Manager)' })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional({ enum: ['NONE', 'FIXED', 'FLEXIBLE'], description: 'Schedule type for time tracking' })
  @IsOptional()
  @IsEnum(['NONE', 'FIXED', 'FLEXIBLE'], { message: 'scheduleType must be NONE, FIXED, or FLEXIBLE' })
  scheduleType?: string;

  @ApiPropertyOptional({ description: 'Monthly hour budget (for FLEXIBLE schedule type)' })
  @IsOptional()
  @IsNumber()
  monthlyHourBudget?: number;

  @ApiPropertyOptional({ enum: ['ADMIN', 'EMPLOYEE'], description: 'New role' })
  @IsOptional()
  @IsEnum(['ADMIN', 'EMPLOYEE'])
  role?: string;

  @ApiPropertyOptional({ description: 'Org-wide role id (AccessRole), or null to clear' })
  @IsOptional()
  @IsString()
  memberRoleId?: string | null;

  @ApiPropertyOptional({ description: 'Can create tasks' })
  @IsOptional()
  @IsBoolean()
  canCreateTasks?: boolean;

  @ApiPropertyOptional({ enum: ['NONE', 'SELF', 'SPACE', 'ORG'], description: 'Task creation scope' })
  @IsOptional()
  @IsEnum(['NONE', 'SELF', 'SPACE', 'ORG'], { message: 'taskCreationScope must be NONE, SELF, SPACE, or ORG' })
  taskCreationScope?: string;

  @ApiPropertyOptional({ description: 'Can view all tasks' })
  @IsOptional()
  @IsBoolean()
  canViewAllTasks?: boolean;

  @ApiPropertyOptional({ description: 'Can assign tasks' })
  @IsOptional()
  @IsBoolean()
  canAssignTasks?: boolean;

  @ApiPropertyOptional({ description: 'Can manage users' })
  @IsOptional()
  @IsBoolean()
  canManageUsers?: boolean;

  @ApiPropertyOptional({ description: 'May build/run reports (report access)' })
  @IsOptional()
  @IsBoolean()
  canViewReports?: boolean;

  @ApiPropertyOptional({ description: 'Per-user Access Profile (modules, spaceScope, platforms, canContact) or a module string[]' })
  @IsOptional()
  enabledModules?: unknown;

  @ApiPropertyOptional({ description: 'Reachable in chat / messaging (inbound)' })
  @IsOptional()
  @IsBoolean()
  contactable?: boolean;

  @ApiPropertyOptional({ enum: ['NONE', 'ALL', 'SELECTED'], description: 'Who this member may contact' })
  @IsOptional()
  @IsEnum(['NONE', 'ALL', 'SELECTED'])
  contactScope?: string;

  @ApiPropertyOptional({ description: 'Allowed contact user IDs (when contactScope=SELECTED)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contactAllowedIds?: string[];

  @ApiPropertyOptional({ description: 'May clock in remotely (WFH/anywhere)' })
  @IsOptional()
  @IsBoolean()
  allowRemote?: boolean;
}
