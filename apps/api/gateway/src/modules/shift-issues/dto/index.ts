import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
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
  ⚠️ These routes took `@Body() body: any` and spread it AFTER the verified
  caller context — `{ ...ctx(req), ...body }` — so a member could send
  `"canManage": true` or somebody else's `callerUserId` and become them. Typed
  now, whitelisted by the global pipe, and the controller builds each payload
  field by field with the caller's context last.
*/

const MIME = /^[a-z]+\/[a-z0-9.+-]+$/i;
const KEY = /^[A-Za-z0-9_\-./]+$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export class ShiftIssueAttachmentDto {
  @ApiPropertyOptional() @ValidateIf((o) => !o.fileUrl) @IsString() @MaxLength(512) @Matches(KEY) fileKey?: string;
  @ApiPropertyOptional({ deprecated: true })
  @ValidateIf((o) => !o.fileKey) @IsUrl({ require_protocol: true, protocols: ['https', 'http'], require_tld: false }) @MaxLength(1024)
  fileUrl?: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) fileName: string;
  @ApiProperty() @IsString() @Matches(MIME) @MaxLength(120) mimeType: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) fileSize?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) width?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) height?: number;
}

export class CreateShiftIssueDto {
  @ApiPropertyOptional({ description: 'Id made on the phone; a resend returns the same issue' })
  @IsOptional() @IsString() @Matches(CLIENT_ID) id?: string;

  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] }) @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']) severity?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(ID) timeEntryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(ID) spaceId?: string;

  /** Sent by the web; photos are posted as the first message once the issue exists. Accepted and not stored here. */
  @ApiPropertyOptional({ type: () => [ShiftIssueAttachmentDto] })
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ShiftIssueAttachmentDto)
  attachments?: ShiftIssueAttachmentDto[];
}

export class ShiftIssueMessageDto {
  @ApiPropertyOptional({ description: 'Id made on the phone; a resend returns the same message' })
  @IsOptional() @IsString() @Matches(CLIENT_ID) id?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) body?: string;

  @ApiPropertyOptional({ type: [ShiftIssueAttachmentDto] })
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ShiftIssueAttachmentDto)
  attachments?: ShiftIssueAttachmentDto[];
}

export class AssignShiftIssueDto {
  @ApiProperty() @IsString() @Matches(ID) assignToId: string;
}

export class ShiftIssueStatusDto {
  @ApiProperty() @IsString() @IsIn(['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELED']) status: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) note?: string;
}

export class PresignShiftIssueAttachmentDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) fileName: string;
  @ApiProperty() @IsString() @Matches(MIME) @MaxLength(120) mimeType: string;
}
