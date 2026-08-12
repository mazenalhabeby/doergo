import { PartialType } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean, IsIn, IsEmail, MaxLength, Min, Max } from 'class-validator';
import { CommissionBasis, CommissionEntryStatus } from '@hbcfield/shared';

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
