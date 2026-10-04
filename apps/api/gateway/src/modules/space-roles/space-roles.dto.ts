import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, MaxLength, ValidateIf } from 'class-validator';
import { BILL_BY_VALUES, MAX_RATE_CENTS, ROLE_KINDS, type BillByValue, type RoleKindValue } from '@hbcfield/shared';

/** `YYYY-MM-DD`. The shared rule then refuses impossible days and far-off dates. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Kind and billing on a role definition — alongside the existing name/colour/permissions body. */
export class RoleKindFieldsDto {
  @ApiPropertyOptional({ enum: ROLE_KINDS, description: 'WORK = a trade that carries billing and grants nothing; MANAGEMENT = permissions' })
  @IsOptional()
  @IsIn(ROLE_KINDS as unknown as string[])
  kind?: RoleKindValue;

  @ApiPropertyOptional({ enum: BILL_BY_VALUES, description: 'WORK roles: how holders are billed unless their assignment overrides' })
  @IsOptional()
  @IsIn(BILL_BY_VALUES as unknown as string[])
  billBy?: BillByValue | null;
}

export class SetDayRateDto {
  @ApiPropertyOptional({ description: 'Cents per day. Null clears it from that day; 0 is a real rate of nothing.' })
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(MAX_RATE_CENTS)
  cents!: number | null;

  @ApiPropertyOptional({ description: 'First day the rate applies, YYYY-MM-DD. Default today. Earlier days keep their rate.' })
  @IsOptional()
  @IsString()
  @Matches(DAY)
  effectiveFrom?: string;
}

export class UpdateMemberRolesDto {
  @ApiPropertyOptional({ description: 'The member\'s trade here (a WORK role). Null clears it.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(64)
  workRoleId?: string | null;

  @ApiPropertyOptional({ description: 'The member\'s management role here (permissions). Null clears it.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(64)
  managementRoleId?: string | null;

  @ApiPropertyOptional({ description: 'May this member hold a work role and a management role here at once?' })
  @IsOptional()
  @IsBoolean()
  allowSecondRole?: boolean;

  @ApiPropertyOptional({ enum: BILL_BY_VALUES, description: 'Overrides the work role\'s billing for this member. Null = as the role.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(BILL_BY_VALUES as unknown as string[])
  billBy?: BillByValue | null;
}

export class UpdateMemberRateDto {
  @ApiPropertyOptional({ description: 'Cents per hour this member is billed at for this client. Null inherits.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(MAX_RATE_CENTS)
  billRateCents?: number | null;

  @ApiPropertyOptional({ description: 'Cents per hour this member costs at this client. Needs canViewLabourCost.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(MAX_RATE_CENTS)
  costRateCents?: number | null;

  @ApiPropertyOptional({ description: 'First day the new rate applies, YYYY-MM-DD. Default today.' })
  @IsOptional()
  @IsString()
  @Matches(DAY)
  effectiveFrom?: string;
}

/** Which rate's history to read. */
export class RateHistoryQueryDto {
  @IsIn(['ORGANIZATION', 'SPACE', 'MEMBER', 'ASSIGNMENT'])
  target!: 'ORGANIZATION' | 'SPACE' | 'MEMBER' | 'ASSIGNMENT';

  @IsString()
  @MaxLength(64)
  targetId!: string;

  /** ASSIGNMENT: the workspace it belongs to — what the caller must manage. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  spaceId?: string;
}
