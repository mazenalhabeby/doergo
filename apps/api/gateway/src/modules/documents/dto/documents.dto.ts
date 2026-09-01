import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsBooleanString,
  IsEnum,
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
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

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
  /*
    The signing route: an ordered list of {role}, or null for one signature.

    Passed through as an opaque array and validated in the service, where
    routeProblem() owns the rule — restating it here as decorators would give
    two definitions of a legal route and one place for them to disagree.
  */
  @ApiPropertyOptional({
    description: 'Ordered signer roles, e.g. [{"role":"MEMBER"},{"role":"RESPONSIBLE"}]. Null for a single signature.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  signerRoute?: unknown[] | null;

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
  /*
    Who signs each step, where the route left a choice.

    Only sent for steps with more than one candidate — a step with exactly one
    resolves itself. The service re-checks every choice against the candidates
    it computes, because a picker is a convenience and not an authorisation.
  */
  @ApiPropertyOptional({ description: 'Chosen signer per route step: [{order, userId|customerId}]' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  signerChoices?: Array<{ order: number; userId?: string | null; customerId?: string | null }>;

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

/**
 * The issued-document register.
 *
 * `tab` is the question being asked, not a status: "unopened" spans two
 * statuses and is the one nobody could see before. An unrecognised value is
 * refused rather than silently widened to everything — a typo must not turn a
 * narrow view into the whole register.
 */
/** One level of the filing cabinet. Every field narrows the folder walked to. */
/** Ask who could sign each step, before issuing. */
export class RouteCandidatesQueryDto {
  @ApiProperty()
  @IsString()
  @Length(1, 64)
  memberId!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 64)
  typeId!: string;
}

/** Return a document to an earlier signer. */
export class SendBackDto {
  @ApiProperty({ description: 'Why it is going back — shown to the earlier signer' })
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class BrowseQueryDto {
  @ApiPropertyOptional({ enum: ['type', 'member', 'year'] })
  @IsOptional()
  @IsEnum(['type', 'member', 'year'])
  groupBy?: 'type' | 'member' | 'year';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 64)
  typeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 64)
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1970)
  @Max(2200)
  year?: number;

  @ApiPropertyOptional({ description: 'Documents with no period at all' })
  @IsOptional()
  @IsBooleanString()
  undated?: string;
}

export class ListIssuedQueryDto {
  @ApiPropertyOptional({ enum: ['awaiting', 'unopened', 'signed', 'all'] })
  @IsOptional()
  @IsEnum(['awaiting', 'unopened', 'signed', 'all'])
  tab?: 'awaiting' | 'unopened' | 'signed' | 'all';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 64)
  typeId?: string;

  @ApiPropertyOptional({ description: 'Narrow to one member' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  userId?: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  // Bounded here as well as in the service: a register is the natural place for
  // somebody to ask for every row at once.
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
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
  /*
    Chosen signers per document, for steps whose route left a choice.

    Only sent for ambiguous steps — one candidate resolves itself, and none is
    a SKIPPED step. Every choice is re-checked against the candidates the
    server computes: a picker is a convenience, not an authorisation.
  */
  @ApiPropertyOptional({ description: '[{documentId, choices:[{order, userId|customerId}]}]' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  signerChoices?: Array<{
    documentId: string;
    choices: Array<{ order: number; userId?: string | null; customerId?: string | null }>;
  }>;

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

/**
 * The scanner's frame, as fractions of the photograph (0–1).
 *
 * Fractions rather than pixels: the phone knows where the frame was relative to
 * the picture it took, and the server should not have to be told the picture's
 * dimensions to believe it.
 */
export class ScanCropDto {
  @ApiProperty() @IsNumber() @Min(0) @Max(1) left!: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(1) top!: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(1) width!: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(1) height!: number;
}

/** Ask what is on a document that has been uploaded but not yet filed. */
export class ReadOwnUploadDto {
  @ApiProperty()
  @IsString()
  stagingKey!: string;

  @ApiPropertyOptional({ type: ScanCropDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ScanCropDto)
  crop?: ScanCropDto;

  @ApiPropertyOptional({ description: 'The reverse of a card — where its zone is' })
  @IsOptional()
  @IsString()
  backStagingKey?: string;

  @ApiPropertyOptional({ type: ScanCropDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ScanCropDto)
  backCrop?: ScanCropDto;
}

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

  @ApiPropertyOptional({ type: ScanCropDto, description: 'Crop to what was inside the frame' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ScanCropDto)
  crop?: ScanCropDto;

  @ApiPropertyOptional({ description: 'The reverse of a card, filed as one document with the front' })
  @IsOptional()
  @IsString()
  backStagingKey?: string;

  @ApiPropertyOptional({ type: ScanCropDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ScanCropDto)
  backCrop?: ScanCropDto;
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
