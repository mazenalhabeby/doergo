import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Matches, MaxLength, Min, ValidateIf } from 'class-validator';

/** A MIME type's shape. The allow-list itself is checked by the owning service. */
const MIME = /^[a-z]+\/[a-z0-9.+-]+$/i;
/** An object key's alphabet — ids, dashes, dots and slashes, nothing else. */
const KEY = /^[A-Za-z0-9_\-./]+$/;
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
 * Confirm an upload. Newer apps send the `fileKey` the presign returned; app
 * 1.0.5 sends the legacy `fileUrl`. One of the two is required.
 *
 * `fileSize` is accepted and ignored — the server reads the real size from
 * storage rather than believing it.
 */
export class ConfirmUploadDto {
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
