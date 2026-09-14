import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CLIENT_ID } from '../../../common/dto/upload.dto';

/*
  The work-log routes took `@Body() body: {…}` — a plain type carries no
  validation metadata, so the global whitelist let any field through. Typed
  now, and shaped to accept exactly what every shipped app already sends.
*/

const MIME = /^[a-z]+\/[a-z0-9.+-]+$/i;
const KEY = /^[A-Za-z0-9_\-./]+$/;

export class AddWorklogNoteDto {
  @ApiPropertyOptional({ description: 'Id made on the phone; a resend returns the same note' })
  @IsOptional()
  @IsString()
  @Matches(CLIENT_ID)
  id?: string;

  @ApiProperty({ example: 'Replaced the burner nozzle' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body: string;

  @ApiPropertyOptional({ description: 'When it happened (the tap), ISO 8601' })
  @IsOptional()
  @IsISO8601()
  at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  taskId?: string;
}

/** A note in an offline flush from app 1.0.5 — no ids, so no `id`. */
export class WorklogBatchNoteDto {
  @ApiProperty() @IsString() @MaxLength(5000) body: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() at?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) taskId?: string;
}

export class AddWorklogNotesBatchDto {
  @ApiProperty({ type: [WorklogBatchNoteDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => WorklogBatchNoteDto)
  notes: WorklogBatchNoteDto[];
}

export class PresignWorklogAttachmentDto {
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

export class ConfirmWorklogAttachmentDto {
  @ApiPropertyOptional({ description: 'Id made on the phone; a resend returns the same attachment' })
  @IsOptional()
  @IsString()
  @Matches(CLIENT_ID)
  id?: string;

  @ApiPropertyOptional()
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

  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) fileName: string;
  @ApiProperty() @IsString() @Matches(MIME) @MaxLength(120) mimeType: string;
  // Numbers, not integers: some pickers report fractional pixel sizes, and
  // refusing an upload over it would lose a photo that app 1.0.5 already took.
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) fileSize?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) width?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) height?: number;
}
