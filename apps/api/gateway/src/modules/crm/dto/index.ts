import { PartialType } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsNumber, IsBoolean, IsIn, IsArray, IsEmail,
  MaxLength, Min, Max, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LeadStatus, SalesActivityType, QuoteStatus, CommissionBasis, CommissionEntryStatus } from '@hbcfield/shared';

// ── Pipelines & stages ───────────────────────────────────────────────────────
export class CreatePipelineDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
export class UpdatePipelineDto extends PartialType(CreatePipelineDto) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class CreateStageDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) probability?: number;
  @IsOptional() @IsBoolean() isWon?: boolean;
  @IsOptional() @IsBoolean() isLost?: boolean;
  @IsOptional() @IsString() @MaxLength(16) color?: string;
}
export class UpdateStageDto extends PartialType(CreateStageDto) {}
export class ReorderStagesDto {
  @IsArray() @IsString({ each: true }) orderedIds!: string[];
}

// ── Contacts ─────────────────────────────────────────────────────────────────
export class CreateContactDto {
  @IsString() @MaxLength(120) firstName!: string;
  @IsOptional() @IsString() @MaxLength(120) lastName?: string;
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() spaceId?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateContactDto extends PartialType(CreateContactDto) {}

// ── Leads ────────────────────────────────────────────────────────────────────
export class CreateLeadDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(160) company?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(60) source?: string;
  @IsOptional() @IsIn(Object.values(LeadStatus)) status?: LeadStatus;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
}
export class UpdateLeadDto extends PartialType(CreateLeadDto) {}
export class ConvertLeadDto {
  @IsOptional() @IsString() @MaxLength(200) dealTitle?: string;
  @IsOptional() @IsNumber() @Min(0) amountCents?: number;
  @IsOptional() @IsString() pipelineId?: string;
}

// ── Deals ────────────────────────────────────────────────────────────────────
export class CreateDealDto {
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() spaceId?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() pipelineId?: string;
  @IsOptional() @IsString() stageId?: string;
  @IsOptional() @IsNumber() @Min(0) amountCents?: number;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
  @IsOptional() @IsString() expectedCloseAt?: string;
  @IsOptional() @IsString() @MaxLength(60) source?: string;
}
export class UpdateDealDto extends PartialType(CreateDealDto) {
  @IsOptional() @IsString() @MaxLength(300) wonReason?: string;
  @IsOptional() @IsString() @MaxLength(300) lostReason?: string;
}
export class MoveDealDto {
  @IsString() stageId!: string;
  @IsOptional() @IsString() @MaxLength(300) wonReason?: string;
  @IsOptional() @IsString() @MaxLength(300) lostReason?: string;
}

// ── Activities ───────────────────────────────────────────────────────────────
export class CreateActivityDto {
  @IsIn(Object.values(SalesActivityType)) type!: SalesActivityType;
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @IsString() dealId?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() spaceId?: string;
  @IsOptional() @IsString() taskId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(4000) body?: string;
  @IsOptional() @IsString() dueAt?: string;
  @IsOptional() @IsString() doneAt?: string;
}
export class UpdateActivityDto extends PartialType(CreateActivityDto) {}

// ── Quotes ───────────────────────────────────────────────────────────────────
export class QuoteLineItemDto {
  @IsString() @MaxLength(300) description!: string;
  @IsNumber() @Min(0) quantity!: number;
  @IsNumber() @Min(0) unitPriceCents!: number;
  @IsOptional() @IsString() taskId?: string;
}
export class CreateQuoteDto {
  @IsString() @MaxLength(200) clientName!: string;
  @IsOptional() @IsString() dealId?: string;
  @IsOptional() @IsString() spaceId?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsEmail() clientEmail?: string;
  @IsOptional() @IsString() @MaxLength(400) clientAddress?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => QuoteLineItemDto) lineItems!: QuoteLineItemDto[];
  @IsOptional() @IsNumber() @Min(0) @Max(1) taxRate?: number;
  @IsOptional() @IsNumber() @Min(0) discountCents?: number;
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
  @IsOptional() @IsString() validUntil?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateQuoteDto extends PartialType(CreateQuoteDto) {}
export class QuoteStatusDto {
  @IsIn(Object.values(QuoteStatus)) status!: QuoteStatus;
}

// ── Commissions ──────────────────────────────────────────────────────────────
export class CreateCommissionRuleDto {
  @IsString() @MaxLength(120) name!: string;
  @IsNumber() @Min(0) @Max(100) percent!: number;
  @IsOptional() @IsIn(Object.values(CommissionBasis)) basis?: CommissionBasis;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateCommissionRuleDto extends PartialType(CreateCommissionRuleDto) {}
export class CommissionEntryStatusDto {
  @IsIn(Object.values(CommissionEntryStatus)) status!: CommissionEntryStatus;
}
