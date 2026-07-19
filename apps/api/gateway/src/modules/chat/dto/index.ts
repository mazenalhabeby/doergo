import { IsString, IsOptional, IsArray, MinLength, MaxLength, ArrayMaxSize, ValidateNested, IsUrl, IsInt, Min, Max } from 'class-validator';
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
  @IsString() @MinLength(1) @MaxLength(5000) body!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ChatAttachmentDto)
  attachments?: ChatAttachmentDto[];
}
