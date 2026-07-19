import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsIn,
  IsUrl,
  IsInt,
  Min,
  Max,
  MaxLength,
  MinLength,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SUPPORT_CATEGORIES, SUPPORT_STATUSES } from '@hbcfield/shared';

export class SupportAttachmentDto {
  @IsString() @MaxLength(255) fileName!: string;
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }) fileUrl!: string;
  @IsString() @MaxLength(120) fileType!: string;
  @IsOptional() @IsInt() @Min(0) @Max(50_000_000) fileSize?: number;
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
  @ArrayMaxSize(10)
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
  @ArrayMaxSize(10)
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
