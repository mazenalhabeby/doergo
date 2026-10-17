/** Moved here unchanged from dto/index.ts. */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Update organization settings DTO
 */
export class UpdateOrgSettingsDto {
  @ApiProperty({ enum: ['OPEN', 'INVITE_ONLY', 'CLOSED'], description: 'Join policy' })
  @IsEnum(['OPEN', 'INVITE_ONLY', 'CLOSED'], { message: 'Join policy must be OPEN, INVITE_ONLY, or CLOSED' })
  joinPolicy: string;
}

/**
 * Query params for listing members
 */
export class ListMembersQueryDto {
  @ApiPropertyOptional({ description: 'Search by name or email' })
  @IsOptional()
  @IsString()
  search?: string;

  /*
    Account type, access-role id, or the absence of one.

    NOT an enum. The filter offers three different kinds of thing — the account
    types ADMIN/EMPLOYEE/CUSTOMER, the ids of roles the organization created,
    and `none` for members holding no role at all — and an enum of the two
    account types rejected the other two with a 400 before the service ever saw
    them. Every custom role in the dropdown was unselectable for that reason.

    The service is the authority on what a value means: it matches the account
    types first, treats `none` as `memberRoleId: null`, and otherwise reads the
    value as a role id, which matches nobody if it is nonsense. Prisma
    parameterises it, so an unrecognised string is a miss, not a risk. Bounded
    only in length, because the set of valid values is data, not a constant.
  */
  @ApiPropertyOptional({
    description: 'ADMIN | EMPLOYEE | CUSTOMER, an access-role id, or "none" for members with no role',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
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
