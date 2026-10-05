import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, MaxLength, ValidateIf } from 'class-validator';
import { BILL_BY_VALUES, MAX_RATE_CENTS, type BillByValue } from '@hbcfield/shared';

/** `YYYY-MM-DD`. The shared rule then refuses impossible days and far-off dates. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

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

  @ApiPropertyOptional({ enum: BILL_BY_VALUES, description: 'How this member is billed here: HOUR, DAY or BOTH. Null = by the hour.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(BILL_BY_VALUES as unknown as string[])
  billBy?: BillByValue | null;

  @ApiPropertyOptional({ enum: ['COUNTED', 'CLOCKED', 'SHIFT'], nullable: true, description: "Which hours go on the client's invoice; null = counted" })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(['COUNTED', 'CLOCKED', 'SHIFT'])
  hoursBasis?: 'COUNTED' | 'CLOCKED' | 'SHIFT' | null;
}

export class MergeRoleDto {
  @ApiPropertyOptional({ description: 'The work role to keep; the one in the path is folded into it and deleted' })
  @IsString()
  intoRoleId!: string;
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

  @ApiPropertyOptional({ description: 'What a DAY of this person costs, in cents. Needs canViewLabourCost.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(MAX_RATE_CENTS)
  costDayCents?: number | null;

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
