/** Moved here unchanged from dto/index.ts. */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CLIENT_ID } from '../../../../common/dto/upload.dto';
import {
  CLIENT_COPY_OPTIONS,
  CREW_REASON_MAX,
  HANDOVER_NOTE_MAX,
  LEAD_SCOPES,
  REPORT_COPIES,
  type LeadScope,
  type TaskReportCopy,
} from '@hbcfield/shared';
import { OccurrenceEvidenceDto } from '../../../../common/dto/occurrence.dto';
import { Type } from 'class-transformer';

/**
 * "What I did, and what is left" on a job — packages/shared/src/tasks/handover.ts.
 * Also the shape of one note sent with a clock-out.
 */
export class HandoverDto {
  @ApiPropertyOptional({ description: 'Id made on the phone; a retry with the same id returns the same note' })
  @IsOptional()
  @IsString()
  @Matches(CLIENT_ID)
  id?: string;

  @ApiProperty({ description: 'What was done and what is left' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(HANDOVER_NOTE_MAX)
  note!: string;

  @ApiPropertyOptional({ description: "Photos, as the job's own attachment ids", type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(CLIENT_ID, { each: true })
  attachmentIds?: string[];
}

export class ClockOutHandoverDto extends HandoverDto {
  @ApiProperty({ description: 'The job the note is about' })
  @IsString()
  @Matches(CLIENT_ID)
  taskId!: string;
}

export class ResumeWorkDto {
  @ApiPropertyOptional({ type: OccurrenceEvidenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OccurrenceEvidenceDto)
  evidence?: OccurrenceEvidenceDto;
}

// ─── A crew on one job (packages/shared/src/tasks/crew.ts) ───

/** Join a crew job — their own tap, "I'm with him", or the office for somebody (with a reason). */
export class CrewJoinDto {
  @ApiPropertyOptional({ type: OccurrenceEvidenceDto })
  @IsOptional() @ValidateNested() @Type(() => OccurrenceEvidenceDto)
  evidence?: OccurrenceEvidenceDto;

  @ApiPropertyOptional({ description: "Confirming the leader's start: counts from it, within 30 minutes" })
  @IsOptional() @IsBoolean()
  viaLeaderStart?: boolean;

  @ApiPropertyOptional({ description: 'The office joining somebody else (needs a reason)' })
  @IsOptional() @IsString() @Matches(CLIENT_ID)
  forUserId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(CREW_REASON_MAX)
  reason?: string;
}

/** Leave a crew job — their own, or the office for somebody. */
export class CrewLeaveDto {
  @ApiPropertyOptional({ type: OccurrenceEvidenceDto })
  @IsOptional() @ValidateNested() @Type(() => OccurrenceEvidenceDto)
  evidence?: OccurrenceEvidenceDto;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @Matches(CLIENT_ID)
  forUserId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(CREW_REASON_MAX)
  reason?: string;
}

/** "My issue": only the caller's own time is blocked. */
export class CrewIssueDto {
  @ApiProperty({ example: 'Waiting for the pump flange kit' })
  @IsString() @IsNotEmpty() @MaxLength(CREW_REASON_MAX)
  reason: string;

  @ApiPropertyOptional({ type: OccurrenceEvidenceDto })
  @IsOptional() @ValidateNested() @Type(() => OccurrenceEvidenceDto)
  evidence?: OccurrenceEvidenceDto;
}

/** Hand THIS job's lead to somebody already on its crew. */
export class ChangeLeadDto {
  @ApiProperty()
  @IsString() @Matches(CLIENT_ID)
  toUserId: string;

  @ApiProperty({ enum: LEAD_SCOPES })
  @IsIn(LEAD_SCOPES as unknown as string[])
  scope: LeadScope;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(CREW_REASON_MAX)
  reason?: string;
}

/**
 * `GET /tasks/:id/full-report?copy=` — which copy of the job report. Absent =
 * the office copy; anything else is refused here (400) and again in
 * task-service (shared parseReportCopy), which is the one that cuts it.
 */
export class TaskReportQueryDto {
  @ApiPropertyOptional({ enum: REPORT_COPIES, default: 'office' })
  @IsOptional()
  @IsIn(REPORT_COPIES as unknown as string[])
  copy?: TaskReportCopy;

  /**
   * Client copy only: what the office adds back, comma-separated
   * (`CLIENT_COPY_OPTIONS`). Parsed and refused on unknown keys in task-service
   * (shared parseClientCopyInclude) — the one that cuts the copy.
   */
  @ApiPropertyOptional({ description: `Comma-separated: ${CLIENT_COPY_OPTIONS.join(', ')}` })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  include?: string;

  /**
   * "Issued by": one of the caller's organization's ACTIVE companies (an id from
   * `meta.issuers`). Absent = the automatic rule (workspace → client → main).
   * Checked in task-service with the invoices' rule (shared usableLegalEntityId);
   * anything else is 400 `REPORT_ISSUER_INVALID`, never a silent fall-back.
   */
  @ApiPropertyOptional({ description: 'Legal entity id to issue the report from' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  issuer?: string;
}
