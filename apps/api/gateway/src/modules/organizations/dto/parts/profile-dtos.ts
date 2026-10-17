/** Moved here unchanged from dto/index.ts. */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

/**
 * Update member profile, role, and permissions DTO
 */
/**
 * Update organization profile DTO — explicitly allowlisted fields
 */
export class UpdateOrgProfileDto {
  @ApiPropertyOptional({ description: 'Organization name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Industry' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ description: 'Org distinguishes in-house vs external field workers' })
  @IsOptional()
  @IsBoolean()
  usesExternalWorkers?: boolean;

  @ApiPropertyOptional({ description: "Crew rules: only a job's leader (or the acting leader, or the office) moves its step" })
  @IsOptional()
  @IsBoolean()
  crewMode?: boolean;

  @ApiPropertyOptional({
    description:
      'What the organization pays in (ISO code, e.g. EUR). Workspaces and ' + 'clients without their own use it.',
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Address (legacy single line)' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Street address' })
  @IsOptional()
  @IsString()
  addressLine1?: string;

  @ApiPropertyOptional({ description: 'Address line 2 (suite/floor)' })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiPropertyOptional({ description: 'City' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'State / province / region' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ description: 'Postal / ZIP code' })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional({ description: 'Country (ISO 3166-1 alpha-2)' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Contact email' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: 'Website URL' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ description: 'Timezone (e.g. America/New_York)' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ description: 'Logo URL' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'VAT / UID number (shown on invoices)' })
  @IsOptional()
  @IsString()
  vatId?: string;

  @ApiPropertyOptional({ description: 'Default billable labor rate charged to customers, in EUR cents/hour (0 or null clears)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000000)
  billableRateCents?: number;

  @ApiPropertyOptional({
    description:
      'Default hourly COST, in EUR cents. Setting one anywhere turns the ' + 'product into a two-rate business.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000000)
  costRateCents?: number | null;

  @ApiPropertyOptional({ description: 'First day a changed rate applies, YYYY-MM-DD. Default today; earlier work keeps its rate.' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  rateEffectiveFrom?: string;

  @ApiPropertyOptional({ description: 'Enabled modules', type: [String] })
  @IsOptional()
  @IsString({ each: true })
  enabledModules?: string[];
}

/*
  Update notification preferences DTO.

  ⚠️ These are the keys the Settings screen SENDS, and the ones the sender
  READS (ORG_EMAIL_SWITCH in shared).

  The class used to declare six other names — `emailEnabled`, `taskAssigned`,
  `commentAdded`… — that no screen sent and nothing read, while the screen sent
  `emailOnTaskComplete` and friends. With `forbidNonWhitelisted` on, every save
  of the Notifications section was refused with a 400, for as long as the
  section existed. A test now pins this list to shared's.
*/
export class UpdateNotificationPrefsDto {
  @ApiPropertyOptional({ description: 'Email a member when a task is assigned to them' })
  @IsOptional()
  @IsBoolean()
  emailOnTaskAssigned?: boolean;

  @ApiPropertyOptional({ description: 'Email a task’s creator when it is completed' })
  @IsOptional()
  @IsBoolean()
  emailOnTaskComplete?: boolean;

  @ApiPropertyOptional({ description: 'Email a member when a shift they left open is closed with a temporary time' })
  @IsOptional()
  @IsBoolean()
  emailOnAutoClockOut?: boolean;

  @ApiPropertyOptional({ description: 'Email on join request' })
  @IsOptional()
  @IsBoolean()
  emailOnJoinRequest?: boolean;

  @ApiPropertyOptional({ description: 'Push notifications enabled' })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;
}

/**
 * Update security settings DTO
 */
export class UpdateSecuritySettingsDto {
  @ApiPropertyOptional({ description: 'Max failed login attempts before lockout' })
  @IsOptional()
  @IsNumber()
  maxFailedAttempts?: number;

  @ApiPropertyOptional({ description: 'Lockout duration in minutes' })
  @IsOptional()
  @IsNumber()
  lockoutDurationMinutes?: number;

  @ApiPropertyOptional({ description: 'Require 2FA for admins' })
  @IsOptional()
  @IsBoolean()
  require2FA?: boolean;

  @ApiPropertyOptional({ description: 'Session timeout in minutes' })
  @IsOptional()
  @IsNumber()
  sessionTimeoutMinutes?: number;

  @ApiPropertyOptional({ description: 'Max concurrent sessions per user' })
  @IsOptional()
  @IsNumber()
  maxConcurrentSessions?: number;
}
