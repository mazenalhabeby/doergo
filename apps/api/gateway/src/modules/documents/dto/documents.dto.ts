import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsISO8601,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

const CADENCES = ['MONTHLY', 'ANNUAL', 'ONE_OFF'] as const;
const DIRECTIONS = ['ISSUED', 'SUPPLIED'] as const;
const SCAN_SHAPES = ['CARD', 'PASSPORT', 'PAGE'] as const;
const SIGNATURE_MODES = ['NONE', 'ACKNOWLEDGE', 'IN_APP', 'WET_INK'] as const;

/**
 * Everything a client may say about a document.
 *
 * Note what is NOT here: `storageKey`, `sha256` and `sizeBytes`. A client that
 * could state a document's hash could state the wrong one, and the integrity
 * claim would then be the client's rather than the server's. All three are
 * computed in the service from the bytes it reads back itself.
 */

export class CreateDocumentTypeDto {
  @ApiProperty({ example: 'payslip' })
  @IsString()
  @Length(1, 60)
  key!: string;

  @ApiProperty({ example: 'Payslip' })
  @IsString()
  @Length(1, 120)
  label!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @ApiPropertyOptional({ enum: CADENCES })
  @IsOptional()
  @IsIn(CADENCES as unknown as string[])
  cadence?: (typeof CADENCES)[number];

  @ApiPropertyOptional({ enum: DIRECTIONS })
  @IsOptional()
  @IsIn(DIRECTIONS as unknown as string[])
  direction?: (typeof DIRECTIONS)[number];

  @ApiPropertyOptional({ description: 'Months to keep after issue; omit to keep indefinitely' })
  @IsOptional()
  @IsInt()
  @Min(1)
  // 600 months is fifty years — beyond the longest retention any of this is
  // subject to, and a bound on what a typo can produce.
  @Max(600)
  retentionMonths?: number;

  @ApiPropertyOptional({ enum: SIGNATURE_MODES })
  @IsOptional()
  @IsIn(SIGNATURE_MODES as unknown as string[])
  signatureMode?: (typeof SIGNATURE_MODES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCredential?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasExpiry?: boolean;

  @ApiPropertyOptional({ type: [String], description: 'Task types this credential is required for' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredForWorkflowIds?: string[];

  @ApiPropertyOptional({ description: 'Every member must provide one' })
  @IsOptional()
  @IsBoolean()
  requiredFromAll?: boolean;

  @ApiPropertyOptional({ type: [String], description: 'Only members with these roles must provide one' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredFromRoleIds?: string[];

  @ApiPropertyOptional({ description: 'The scanner asks for the back as well' })
  @IsOptional()
  @IsBoolean()
  twoSided?: boolean;

  @ApiPropertyOptional({ enum: SCAN_SHAPES, description: 'The frame the scanner draws' })
  @IsOptional()
  @IsIn(SCAN_SHAPES as unknown as string[])
  scanShape?: (typeof SCAN_SHAPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

/**
 * `cadence` and `direction` are absent by design — changing either would
 * re-interpret every document already filed under the type. Make a new type.
 */
export class UpdateDocumentTypeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  retentionMonths?: number;

  @ApiPropertyOptional({ enum: SIGNATURE_MODES })
  @IsOptional()
  @IsIn(SIGNATURE_MODES as unknown as string[])
  signatureMode?: (typeof SIGNATURE_MODES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCredential?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasExpiry?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredForWorkflowIds?: string[];

  @ApiPropertyOptional({ description: 'Every member must provide one' })
  @IsOptional()
  @IsBoolean()
  requiredFromAll?: boolean;

  @ApiPropertyOptional({ type: [String], description: 'Only members with these roles must provide one' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredFromRoleIds?: string[];

  @ApiPropertyOptional({ description: 'The scanner asks for the back as well' })
  @IsOptional()
  @IsBoolean()
  twoSided?: boolean;

  @ApiPropertyOptional({ enum: SCAN_SHAPES, description: 'The frame the scanner draws' })
  @IsOptional()
  @IsIn(SCAN_SHAPES as unknown as string[])
  scanShape?: (typeof SCAN_SHAPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

export class PresignUploadDto {
  @ApiProperty({ description: 'The member this document is for' })
  @IsString()
  userId!: string;

  @ApiProperty()
  @IsString()
  typeId!: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @Length(1, 100)
  mimeType!: string;

  @ApiProperty({ description: 'Bytes. Signed into the upload URL, so it is enforced by the store.' })
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}

export class ConfirmUploadDto {
  @ApiProperty({ description: 'The key returned by /presign' })
  @IsString()
  @Length(1, 500)
  stagingKey!: string;

  @ApiProperty()
  @IsString()
  userId!: string;

  @ApiProperty()
  @IsString()
  typeId!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1970)
  @Max(2200)
  periodYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth?: number;

  @ApiPropertyOptional({ description: 'Required for credential types' })
  @IsOptional()
  @IsISO8601()
  expiresOn?: string;

  @ApiPropertyOptional({
    description:
      'Stage instead of publishing. The member sees nothing and no notification is sent until the batch is released.',
  })
  @IsOptional()
  @IsBoolean()
  asDraft?: boolean;
}

export class ListDocumentsQueryDto {
  @ApiPropertyOptional({ description: 'Omit for your own documents' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  typeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1970)
  @Max(2200)
  year?: number;

  @ApiPropertyOptional({ description: 'Matches the document title' })
  @IsOptional()
  @IsString()
  @Length(0, 100)
  search?: string;
}

export class PublishBatchDto {
  @ApiProperty({ type: [String], description: 'Every staged document in the batch' })
  @IsArray()
  @IsString({ each: true })
  // A payroll run is tens of files. The cap is a backstop against a malformed
  // client, not a real limit — and it fails loudly rather than truncating,
  // because a silently shortened batch leaves payslips unpublished.
  @ArrayMaxSize(500)
  documentIds!: string[];
}

const SIGN_MODES_TEMPLATE = ['NONE', 'ACKNOWLEDGE', 'IN_APP', 'WET_INK'] as const;

/**
 * A draft to lay out as a PDF. Deliberately NOT `CreateTemplateDto`: a preview
 * is asked for while the template is still half-written, so it must not require
 * the document type or the bindings that saving does.
 */
/**
 * A member asking for somewhere to put their own file.
 *
 * No `userId`: the member is the token, always. Adding one would create a
 * shape of this request that files a document into somebody else's record.
 */
/** Refusing a member's upload. The reason is not optional — they read it. */
export class RejectDocumentDto {
  @ApiProperty({ example: 'The expiry date on the card does not match the one entered.' })
  @IsString()
  @Length(1, 500)
  reason!: string;
}

export class PresignOwnUploadDto {
  @ApiProperty()
  @IsString()
  typeId!: string;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  mimeType!: string;

  @ApiProperty({ description: 'Bytes. Checked again against the object on confirm.' })
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}

/** The member confirming the bytes are up. */
export class SubmitOwnDocumentDto {
  @ApiProperty()
  @IsString()
  stagingKey!: string;

  @ApiProperty()
  @IsString()
  typeId!: string;

  @ApiPropertyOptional({ description: 'Defaults to the type label' })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  title?: string;

  @ApiPropertyOptional({ description: 'Required when the type expires. ISO date.' })
  @IsOptional()
  @IsDateString()
  expiresOn?: string;

  /**
   * What a scanner read off the document — the machine-readable zone as text.
   *
   * Checked server-side and never trusted: the check digits are recomputed
   * here, so a client that sent an invented zone gets a SUSPECT verdict rather
   * than a pass. Long enough for three lines and whatever surrounds them.
   */
  @ApiPropertyOptional({ description: "The document's machine-readable zone, as scanned" })
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  mrzText?: string;
}

export class PreviewTemplateDto {
  @ApiPropertyOptional({
    description:
      'Body with {{merge.tokens}}. Omit to ask only for the resolved values — ' +
      'the editor does that once per member to render its live text preview.',
  })
  @IsOptional()
  @IsString()
  @Length(0, 200_000)
  body?: string;

  @ApiPropertyOptional({ description: 'Heading printed on the first page' })
  @IsOptional()
  @IsString()
  @Length(0, 160)
  title?: string;

  @ApiPropertyOptional({ description: 'Fill it in for this member; defaults to anyone' })
  @IsOptional()
  @IsString()
  memberId?: string;
}

export class CreateTemplateDto {
  @ApiProperty()
  @IsString()
  typeId!: string;

  @ApiProperty({ example: 'Employment contract — Field Technician' })
  @IsString()
  @Length(1, 160)
  name!: string;

  @ApiProperty({ description: 'Body with {{merge.tokens}}' })
  @IsString()
  @Length(1, 200_000)
  body!: string;

  @ApiPropertyOptional({ description: 'The role this applies to' })
  @IsOptional()
  @IsString()
  appliesToRoleId?: string;

  @ApiPropertyOptional({ description: 'The job title this applies to' })
  @IsOptional()
  @IsString()
  @Length(0, 120)
  appliesToPosition?: string;

  @ApiPropertyOptional({ enum: SIGN_MODES_TEMPLATE })
  @IsOptional()
  @IsIn(SIGN_MODES_TEMPLATE as unknown as string[])
  signatureMode?: (typeof SIGN_MODES_TEMPLATE)[number];

  @ApiPropertyOptional({ description: 'Days an unsigned contract stays signable' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  offerValidDays?: number;
}

export class UpdateTemplateDto extends CreateTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class IssueFromTemplateDto {
  @ApiProperty()
  @IsString()
  userId!: string;

  @ApiPropertyOptional({ description: 'Omit to resolve from the member’s role and job title' })
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiPropertyOptional({ example: 38.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(168)
  weeklyHours?: number;
}

export class SignDocumentDto {
  @ApiProperty({ description: 'PNG data URL from the signature pad' })
  @IsString()
  // Big enough for a drawn signature, small enough that a payload cannot be a
  // vector for something else. The service re-checks the decoded bytes.
  @Length(100, 3_000_000)
  signatureImage!: string;

  @ApiProperty({
    description:
      'A key the client generates once per signing attempt. A retry with the same key returns the existing seal instead of signing twice.',
  })
  @IsString()
  @Length(8, 100)
  idempotencyKey!: string;
}
