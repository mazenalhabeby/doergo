import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { RULE_KINDS } from '@hbcfield/shared';

export class ApprovalRuleDto {
  @IsIn(RULE_KINDS as unknown as string[]) kind!: (typeof RULE_KINDS)[number];
  @IsOptional() @IsString() @Length(1, 128) spaceId?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(1440) minMinutes?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(366) minDays?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) minAmountCents?: number | null;
  @IsString() @Length(1, 128) secondRoleId!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
