import { IsString, IsOptional, IsArray, MinLength, MaxLength, ArrayMaxSize, ValidateNested, IsUrl, IsInt, Min, Max, Matches, IsISO8601 } from 'class-validator';
import { CLIENT_ID } from '../../../common/dto/upload.dto';
import { Type } from 'class-transformer';

export class ChatAttachmentDto {
  @IsString() @MaxLength(255) fileName!: string;
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }) fileUrl!: string;
  @IsString() @MaxLength(120) fileType!: string;
  @IsOptional() @IsInt() @Min(0) @Max(50_000_000) fileSize?: number;
}

export class OpenDirectDto {
  @IsString() userId!: string; // the member to message
}

export class SendMessageDto {
  /** Made on the phone: a message sent twice (a lost answer, a queue replay) is one message. */
  @IsOptional() @IsString() @Matches(CLIENT_ID) id?: string;

  /** When it was written, for a message sent late from offline. */
  @IsOptional() @IsISO8601() sentAt?: string;

  @IsString() @MinLength(1) @MaxLength(5000) body!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ChatAttachmentDto)
  attachments?: ChatAttachmentDto[];
}
