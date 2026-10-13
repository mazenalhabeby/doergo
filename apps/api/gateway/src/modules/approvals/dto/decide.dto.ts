import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { APPROVAL_KINDS, type ApprovalActionId, type ApprovalKind } from '@hbcfield/shared';

/** One decision from the inbox. Shape only — the kind's own route judges it. */
export class DecideApprovalDto {
  @ApiProperty({ enum: APPROVAL_KINDS })
  @IsIn(APPROVAL_KINDS as unknown as string[])
  kind!: ApprovalKind;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  id!: string;

  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsIn(['approve', 'reject'])
  action!: ApprovalActionId;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresOn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  spaceId?: string;
}
