import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsBoolean, IsNumber } from 'class-validator';
import { Transform } from 'class-transformer';

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

  @ApiPropertyOptional({ enum: ['ADMIN', 'MANAGER', 'EMPLOYEE', 'DISPATCHER', 'TECHNICIAN'], description: 'Filter by role' })
  @IsOptional()
  @IsEnum(['ADMIN', 'MANAGER', 'EMPLOYEE', 'DISPATCHER', 'TECHNICIAN'])
  role?: string;

  @ApiPropertyOptional({ description: 'Page number' })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page' })
  @IsOptional()
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

  @ApiPropertyOptional({ description: 'Address' })
  @IsOptional()
  @IsString()
  address?: string;

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

  @ApiPropertyOptional({ enum: ['ADMIN', 'MANAGER', 'EMPLOYEE', 'DISPATCHER', 'TECHNICIAN'], description: 'New role' })
  @IsOptional()
  @IsEnum(['ADMIN', 'MANAGER', 'EMPLOYEE', 'DISPATCHER', 'TECHNICIAN'])
  role?: string;

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

  @ApiPropertyOptional({ description: 'Per-user Access Profile (modules, spaceScope, platforms, canContact, webScreens) or a module string[]' })
  @IsOptional()
  enabledModules?: unknown;
}
