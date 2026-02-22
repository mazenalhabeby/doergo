import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsBoolean } from 'class-validator';
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

  @ApiPropertyOptional({ enum: ['ADMIN', 'DISPATCHER', 'TECHNICIAN'], description: 'Filter by role' })
  @IsOptional()
  @IsEnum(['ADMIN', 'DISPATCHER', 'TECHNICIAN'])
  role?: string;

  @ApiPropertyOptional({ description: 'Page number' })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page' })
  @IsOptional()
  limit?: number;
}

/**
 * Update member role and permissions DTO
 */
export class UpdateMemberRoleDto {
  @ApiProperty({ enum: ['ADMIN', 'DISPATCHER', 'TECHNICIAN'], description: 'New role' })
  @IsEnum(['ADMIN', 'DISPATCHER', 'TECHNICIAN'])
  role: string;

  @ApiPropertyOptional({ enum: ['WEB', 'MOBILE', 'BOTH'], description: 'Platform access' })
  @IsOptional()
  @IsEnum(['WEB', 'MOBILE', 'BOTH'])
  platform?: string;

  @ApiPropertyOptional({ description: 'Can create tasks' })
  @IsOptional()
  @IsBoolean()
  canCreateTasks?: boolean;

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
}
