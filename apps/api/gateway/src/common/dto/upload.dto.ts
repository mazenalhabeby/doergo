import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUrl, Matches, MaxLength, Min, ValidateIf } from 'class-validator';

/** A MIME type's shape. The allow-list itself is checked by the owning service. */
export const MIME = /^[a-z]+\/[a-z0-9.+-]+$/i;
/** An object key's alphabet — ids, dashes, dots and slashes, nothing else. */
export const KEY = /^[A-Za-z0-9_\-./]+$/;
/**
 * An id the PHONE made (UUIDv7) for a record it created, possibly offline.
 * The server stores it as the real id, so retrying the create is the same create.
 */
export const CLIENT_ID = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Ask for an upload link.
 *
 * Typed rather than `@Body() body: {…}`: a plain type carries no validation
 * metadata, so the global whitelist let any extra field through — and one route
 * spread the body into the job AFTER setting the id it was authorising.
 */
export class PresignUploadDto {
  @ApiProperty({ example: 'boiler.jpg' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  @Matches(MIME)
  @MaxLength(120)
  fileType: string;
}

/**
 * Where an uploaded file now is: the `fileKey` the presign returned, or the
 * legacy `fileUrl` app 1.0.5 sends. One of the two is required. Every confirm
 * route — task attachments, report photos, worklog notes, shift issues — takes
 * it this way, so the rule is written here once.
 */
export class StoredFileRefDto {
  @ApiPropertyOptional({ example: 'org_1/attachments/task_1/2b1f….jpg' })
  @ValidateIf((o) => !o.fileUrl)
  @IsString()
  @MaxLength(512)
  @Matches(KEY)
  fileKey?: string;

  @ApiPropertyOptional({ deprecated: true })
  @ValidateIf((o) => !o.fileKey)
  @IsUrl({ require_protocol: true, protocols: ['https', 'http'], require_tld: false })
  @MaxLength(1024)
  fileUrl?: string;
}

/**
 * Ask for an upload link for a photo or file, named `mimeType` — the spelling
 * worklog notes and shift issues use (the task routes say `fileType`, above).
 */
export class PresignMediaDto {
  @ApiProperty({ example: 'meter.jpg' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  @Matches(MIME)
  @MaxLength(120)
  mimeType: string;
}

/** An uploaded photo or file as worklog notes and shift issues attach it. */
export class MediaAttachmentDto extends StoredFileRefDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) fileName: string;
  @ApiProperty() @IsString() @Matches(MIME) @MaxLength(120) mimeType: string;
  // Numbers, not integers: some pickers report fractional pixel sizes, and
  // refusing an upload over it would lose a photo that app 1.0.5 already took.
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) fileSize?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) width?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) height?: number;
}

/**
 * Confirm an upload. Newer apps send the `fileKey` the presign returned; app
 * 1.0.5 sends the legacy `fileUrl`. One of the two is required.
 *
 * `fileSize` is accepted and ignored — the server reads the real size from
 * storage rather than believing it.
 */
export class ConfirmUploadDto extends StoredFileRefDto {
  @ApiPropertyOptional({ description: 'Id made on the phone; a retry with the same id returns the same attachment' })
  @IsOptional()
  @IsString()
  @Matches(CLIENT_ID)
  id?: string;

  @ApiProperty({ example: 'boiler.jpg' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  /** Optional for app 1.0.5's report photos, which never sent it. */
  @ApiPropertyOptional({ example: 'image/jpeg' })
  @IsOptional()
  @IsString()
  @Matches(MIME)
  @MaxLength(120)
  fileType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  fileSize?: number;
}

/** A service report photo: which side of the job, and an optional caption. */
export class ConfirmReportAttachmentDto extends ConfirmUploadDto {
  @ApiProperty({ enum: ['BEFORE', 'AFTER'] })
  @IsIn(['BEFORE', 'AFTER'])
  type: 'BEFORE' | 'AFTER';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;
}
