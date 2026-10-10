import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CLIENT_ID, MediaAttachmentDto, PresignMediaDto } from '../../../common/dto/upload.dto';

/*
  The work-log routes took `@Body() body: {…}` — a plain type carries no
  validation metadata, so the global whitelist let any field through. Typed
  now, and shaped to accept exactly what every shipped app already sends.
*/


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
class WorklogBatchNoteDto {
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

export class PresignWorklogAttachmentDto extends PresignMediaDto {}

export class ConfirmWorklogAttachmentDto extends MediaAttachmentDto {
  @ApiPropertyOptional({ description: 'Id made on the phone; a resend returns the same attachment' })
  @IsOptional()
  @IsString()
  @Matches(CLIENT_ID)
  id?: string;
}
