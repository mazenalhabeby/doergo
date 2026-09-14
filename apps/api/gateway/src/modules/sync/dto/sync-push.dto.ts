import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { SYNC_OPERATIONS, SYNC_PUSH_MAX_OPS, SYNC_PULL_SCOPES, SYNC_PULL_MAX_ROWS, SYNC_MEDIA_LINKS_MAX } from '@hbcfield/shared';

const ID = /^[A-Za-z0-9_-]{16,128}$/;

export class SyncOperationDto {
  @ApiProperty({ description: 'UUIDv7 made on the phone; also the Idempotency-Key' })
  @IsString()
  @Matches(ID)
  id: string;

  @ApiProperty({ enum: Object.keys(SYNC_OPERATIONS) })
  @IsIn(Object.keys(SYNC_OPERATIONS))
  op: string;

  @ApiProperty({ example: 'task:ckx1…' })
  @IsString()
  @MaxLength(160)
  @Matches(/^[a-z][A-Za-z]*:[A-Za-z0-9_-]{1,128}$/)
  lane: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SYNC_PUSH_MAX_OPS)
  @Matches(ID, { each: true })
  dependsOn?: string[];

  @ApiProperty({ description: '{ params, body } for the operation route' })
  @IsObject()
  payload: { params?: Record<string, string>; body?: unknown };

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  evidence?: Record<string, unknown>;
}

export class SyncPushDto {
  @ApiProperty({ type: [SyncOperationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SYNC_PUSH_MAX_OPS)
  @ValidateNested({ each: true })
  @Type(() => SyncOperationDto)
  operations: SyncOperationDto[];
}

export class SyncPullQueryDto {
  @ApiProperty({ enum: SYNC_PULL_SCOPES })
  @IsIn(SYNC_PULL_SCOPES as unknown as string[])
  scope: (typeof SYNC_PULL_SCOPES)[number];

  @ApiPropertyOptional({ description: 'The cursor from the previous pull' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Matches(/^[A-Za-z0-9_-]+$/)
  cursor?: string;

  @ApiPropertyOptional({ maximum: SYNC_PULL_MAX_ROWS })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SYNC_PULL_MAX_ROWS)
  limit?: number;
}

/** Attachment ids the phone wants links for, to keep the photos for offline viewing. */
export class SyncMediaLinksDto {
  @ApiProperty({ type: [String], maxItems: SYNC_MEDIA_LINKS_MAX })
  @IsArray()
  @ArrayMaxSize(SYNC_MEDIA_LINKS_MAX)
  @IsString({ each: true })
  @Matches(/^[A-Za-z0-9_-]{1,64}$/, { each: true })
  ids: string[];
}

/** How a phone's queue is doing — counts and ages only. */
export class SyncTelemetryDto {
  @ApiProperty() @IsString() @MaxLength(40) appVersion: string;
  @ApiProperty() @IsInt() @Min(0) @Max(1_000_000) waiting: number;
  @ApiProperty() @IsInt() @Min(0) @Max(1_000_000) attention: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) oldestWaitingAt: number | null;
  @ApiProperty() @IsObject() byState: Record<string, number>;
  @ApiProperty() @IsObject() codes: Record<string, number>;
  @ApiProperty() @IsInt() @Min(0) @Max(1_000_000) filesWaiting: number;
  @ApiProperty() @IsInt() @Min(0) bytesWaiting: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) lastSuccessAt: number | null;
}
