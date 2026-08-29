import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

const CADENCES = ['MONTHLY', 'ANNUAL', 'ONE_OFF'] as const;
const DIRECTIONS = ['ISSUED', 'SUPPLIED'] as const;
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
