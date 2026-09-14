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
} from 'class-validator';
import { SYNC_OPERATIONS, SYNC_PUSH_MAX_OPS } from '@hbcfield/shared';

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
