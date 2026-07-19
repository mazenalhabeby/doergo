import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsIn,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SUPPORT_CATEGORIES, SUPPORT_STATUSES } from '@hbcfield/shared';

export class SupportAttachmentDto {
  @IsString() fileName!: string;
  @IsString() fileUrl!: string;
  @IsString() fileType!: string;
  @IsOptional() fileSize?: number;
}

export class CreateTicketDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsIn(SUPPORT_CATEGORIES as unknown as string[])
  category?: string;

  @IsOptional()
  @IsIn(['WEB', 'MOBILE'])
  channel?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupportAttachmentDto)
  attachments?: SupportAttachmentDto[];
}

export class AddMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupportAttachmentDto)
  attachments?: SupportAttachmentDto[];

  // Agent-only: private note not delivered to the customer.
  @IsOptional()
  @IsBoolean()
  isInternalNote?: boolean;
}

export class SetStatusDto {
  @IsIn(SUPPORT_STATUSES as unknown as string[])
  status!: string;
}

export class AssignDto {
  @IsOptional()
  @IsString()
  agentId?: string | null;
}
