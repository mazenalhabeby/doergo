import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString,
  Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { KIND_SHAPE_LIMITS } from '@hbcfield/shared';
import { AssetHolderDto } from './asset.dto';

/**
 * Hand a record to somebody — or take it back, by sending an empty list.
 *
 * ⚠️ `to` is a real class array, exactly as `holders` is. With the global
 * pipe's `enableImplicitConversion`, an array typed only with `@IsArray()` has
 * its objects coerced to `[]`: the request validates, answers 200 and hands the
 * asset to nobody. That has already happened once on the sibling DTO, which is
 * why the same shape is repeated here rather than loosened.
 */
export class HandOverDto {
  @ApiPropertyOptional({ type: [AssetHolderDto], description: 'Who gets it. Empty means nobody.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(KIND_SHAPE_LIMITS.maxHolders)
  @ValidateNested({ each: true })
  @Type(() => AssetHolderDto)
  to?: AssetHolderDto[];

  @ApiPropertyOptional({ description: 'When it changed hands. Now, if omitted. Never the future.' })
  @IsOptional()
  @IsDateString()
  at?: string;

  @ApiPropertyOptional({ description: 'Why — "rental ended", "moved to the Linz depot".' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

/** The photograph of a slip, before it exists. */
export class ReceiptPresignDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({ description: 'An image or a PDF. Anything else is refused.' })
  @IsString()
  @MaxLength(100)
  mimeType!: string;

  @ApiPropertyOptional({ description: 'When the money moved — it decides WHO may file this.' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

/**
 * An expense filed against something the caller holds.
 *
 * The amount is integer CENTS and is capped. Money in floating point is a
 * rounding bug waiting for a large total, and an uncapped integer is a way to
 * put an absurd figure into an organization's books from a phone.
 */
export class SubmitExpenseDto {
  @ApiProperty({ description: 'A heading the KIND declares — never free text.' })
  @IsString()
  @MaxLength(KIND_SHAPE_LIMITS.maxLabel)
  category!: string;

  @ApiProperty({ description: 'Integer cents, always positive.' })
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amountCents!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ description: 'When the money moved. Today, if omitted.' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional({ description: 'The key returned by presign. Checked against this asset.' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  receiptKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  receiptName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  receiptMime?: string;
}

/** Accept it, or refuse it with a reason the member reads. */
export class ReviewExpenseDto {
  @ApiProperty({ enum: ['accept', 'reject'] })
  @IsIn(['accept', 'reject'])
  decision!: 'accept' | 'reject';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

/**
 * The reading off a contract, after a person has corrected it.
 *
 * ⚠️ Note what is NOT here: no `closeAssetId`, no `retireAssetId`, no list of
 * steps. Those are DERIVED on the server from the kind and from what the member
 * actually holds, on the preview and again on the apply. A client that could
 * name the record to retire could retire any record.
 */
export class ContractFieldsDto {
  @ApiPropertyOptional({ description: 'Overrides whatever the reader assembled.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  registration?: string;

  @ApiPropertyOptional({ description: '17 characters, and the one field that proves itself.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  vin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  serial?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  manufacturer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @ApiPropertyOptional({ description: 'When the term begins. A custody never starts in the future.' })
  @IsOptional()
  @IsDateString()
  startsOn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsOn?: string;
}

/** Everything the proposal needs: which kind, which person, what was read. */
export class ContractProposalDto {
  @ApiProperty({ description: 'The KIND — it decides the workspace, the fields and the holder rules.' })
  @IsString()
  @MaxLength(60)
  categoryId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  typeId?: string;

  @ApiProperty({ description: 'Who receives it.' })
  @IsString()
  @MaxLength(60)
  holderUserId!: string;

  @ApiProperty({ type: ContractFieldsDto })
  @ValidateNested()
  @Type(() => ContractFieldsDto)
  fields!: ContractFieldsDto;

  @ApiPropertyOptional({ description: 'Retire what it replaces — which also stops it being billed.' })
  @IsOptional()
  @IsBoolean()
  retireReplaced?: boolean;
}

/** Text somebody pasted, for the surface that has no reader of its own. */
export class ReadContractDto {
  @ApiProperty()
  @IsString()
  @MaxLength(20_000)
  text!: string;
}

/**
 * A member sending a page in.
 *
 * ⚠️ No `steps`, no `closeAssetId`, no `categoryId` from a driver. What a member
 * knows is what is printed on the paper in their hand; the organization's asset
 * taxonomy and what would be retired are the reviewer's business, worked out at
 * review time from what the member holds THEN.
 */
export class RaiseProposalDto {
  @ApiProperty({ type: ContractFieldsDto })
  @ValidateNested()
  @Type(() => ContractFieldsDto)
  fields!: ContractFieldsDto;

  @ApiPropertyOptional({ description: 'Why the reader thought this was a contract.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  signals?: string[];

  @ApiPropertyOptional({ enum: ['asset-contract', 'unknown'] })
  @IsOptional()
  @IsIn(['asset-contract', 'unknown'])
  documentKind?: string;

  @ApiPropertyOptional({ description: 'The key returned by presign. Checked against this organization.' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  fileKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fileMime?: string;

  @ApiPropertyOptional({ description: 'Only honoured for somebody who manages the register.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  holderUserId?: string;

  @ApiPropertyOptional({ description: 'Likewise — a member does not know the taxonomy.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  categoryId?: string;
}

/** The reviewer's decision, with their own corrections. */
export class AcceptProposalDto {
  @ApiPropertyOptional({ description: 'Required unless the proposal already names one.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  typeId?: string;

  @ApiPropertyOptional({ type: ContractFieldsDto, description: 'Overrides what was sent in.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContractFieldsDto)
  fields?: ContractFieldsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  retireReplaced?: boolean;
}

/** A place to put the page, before the proposal exists. */
export class ProposalPresignDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  mimeType!: string;
}
