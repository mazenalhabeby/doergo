import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { LEAVE_TYPES, REQUEST_KINDS, REQUEST_LIMITS } from '@hbcfield/shared';
import { CLIENT_ID } from '../../../common/dto/upload.dto';

/**
 * A member asks for something: leave, a remote day, changed hours, overtime agreed in advance,
 * or anything else (shared requests/request-kinds.ts). It may carry the id the phone made, so a
 * request queued offline and sent twice is still one request.
 *
 * ⚠️ This class only WHITELISTS the fields (the global pipe refuses unknown ones). What a valid
 * request is — which fields belong to which kind, the dates, the times, the minutes — is decided
 * once, by `parseRequestInput` in task-service, with coded refusals. A second copy of those rules
 * here would drift from the phone's and the web's.
 */
export class RequestTimeOffDto {
  @ApiPropertyOptional({ description: 'Id made on the phone; a resend returns the same request' })
  @IsOptional() @IsString() @Matches(CLIENT_ID)
  id?: string;

  @ApiPropertyOptional({ enum: REQUEST_KINDS, description: 'Absent = LEAVE (what older phones send)' })
  @IsOptional() @IsString() @MaxLength(16)
  kind?: string;

  @ApiProperty({ example: '2026-10-01' }) @IsString() @MaxLength(32) startDate: string;

  @ApiPropertyOptional({ example: '2026-10-05', description: 'Absent = the start day (HOURS / OVERTIME are one day)' })
  @IsOptional() @IsString() @MaxLength(32)
  endDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(REQUEST_LIMITS.REASON_MAX) reason?: string;

  /** LEAVE only. Only VACATION is deducted from the allowance. Defaults to VACATION. */
  @ApiPropertyOptional({ enum: LEAVE_TYPES }) @IsOptional() @IsString() @MaxLength(16) type?: string;

  /** REMOTE (required) / HOURS / OVERTIME / OTHER: the workspace it is about. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) spaceId?: string;

  /** HOURS: the day's new start / end, HH:MM. */
  @ApiPropertyOptional({ example: '10:00' }) @IsOptional() @IsString() @MaxLength(5) startTime?: string;
  @ApiPropertyOptional({ example: '15:00' }) @IsOptional() @IsString() @MaxLength(5) endTime?: string;

  /** OVERTIME: minutes agreed in advance. */
  @ApiPropertyOptional({ example: 120 }) @IsOptional() @IsInt() minutes?: number;
}
