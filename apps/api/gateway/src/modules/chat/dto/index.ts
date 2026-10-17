import {
  IsString,
  IsOptional,
  IsArray,
  MaxLength,
  ArrayMaxSize,
  ValidateNested,
  Matches,
  IsISO8601,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CHAT_GROUP_MAX_MEMBERS, CHAT_GROUP_TITLE_MAX, CHAT_MAX_ATTACHMENTS } from '@hbcfield/shared';
import { CLIENT_ID, MediaAttachmentDto } from '../../../common/dto/upload.dto';

export { PresignMediaDto as ChatPresignDto } from '../../../common/dto/upload.dto';

export class OpenDirectDto {
  @IsString() userId!: string; // the member to message
}

export class SendMessageDto {
  /** Made on the phone: a message sent twice (a lost answer, a queue replay) is one message. */
  @IsOptional() @IsString() @Matches(CLIENT_ID) id?: string;

  /** When it was written, for a message sent late from offline. */
  @IsOptional() @IsISO8601() sentAt?: string;

  /** May be empty when the message carries files (the service refuses a message with neither). */
  @IsString() @MaxLength(5000) body!: string;

  /*
    Files go through chat's own presign: only a KEY under this conversation that
    really exists in storage is accepted (task-service chat-files). A bare URL —
    the reason attachments were refused until now — carries no key and is refused.
  */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CHAT_MAX_ATTACHMENTS)
  @ValidateNested({ each: true })
  @Type(() => MediaAttachmentDto)
  attachments?: MediaAttachmentDto[];
}

export class CreateGroupDto {
  @IsString() @MaxLength(CHAT_GROUP_TITLE_MAX) title!: string;
  @IsArray()
  @ArrayMaxSize(CHAT_GROUP_MAX_MEMBERS)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  memberIds!: string[];
}

export class RenameGroupDto {
  @IsString() @MaxLength(CHAT_GROUP_TITLE_MAX) title!: string;
}

export class AddMembersDto {
  @IsArray()
  @ArrayMaxSize(CHAT_GROUP_MAX_MEMBERS)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  userIds!: string[];
}

export class ChatSearchQueryDto {
  @IsString() @MaxLength(200) q!: string;
  @IsOptional() @IsString() @MaxLength(100) before?: string;
}

export class EditMessageDto {
  @IsString() @MaxLength(5000) body!: string;
}

export class MuteConversationDto {
  /** Pushes off until then; null turns them back on. */
  @ValidateIf((o) => o.until !== null) @IsISO8601() until!: string | null;
}
