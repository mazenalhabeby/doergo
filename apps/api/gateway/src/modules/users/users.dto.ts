import {
  IsString,
  IsOptional,
  IsEmail,
  IsNotEmpty,
  IsIn,
  ValidateIf,
  IsBoolean,
  IsObject,
  MaxLength,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';
import { SUPPORTED_LOCALES, type SupportedLocale, CLOCK_IN_PICK_MODES, type ClockInPick } from '@hbcfield/shared';

class RegisterPushTokenDto {
  @IsString()
  token: string;

  @IsString()
  platform: string; // 'ios' | 'android' | 'web'

  @IsString()
  @IsOptional()
  deviceId?: string;

  // The language the app is set to. Sent on every registration, which every
  // launch makes, so the server hears about a change even from an app that
  // never calls the profile endpoint. Older builds omit it and change nothing.
  //
  // ⚠️ Deliberately NOT @IsIn here. A 400 would refuse the TOKEN along with the
  // language, and a future app build offering a sixth language would silently
  // stop receiving pushes at all. The value is checked against SUPPORTED_LOCALES
  // where it is stored (RecipientLocales.set → normalizeLocale), and an unknown
  // one is dropped there without touching what was stored.
  @IsOptional()
  @IsString()
  @MaxLength(16)
  locale?: string;
}

class UpdateMeDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  // Manual availability override; null clears it back to auto.
  @IsOptional()
  @ValidateIf((o) => o.presence !== null)
  @IsIn(['AVAILABLE', 'BUSY', 'AWAY'])
  presence?: 'AVAILABLE' | 'BUSY' | 'AWAY' | null;

  // Per-user clock display preference ("12h" | "24h"); display-only.
  @IsOptional()
  @IsIn(['12h', '24h'])
  timeFormat?: '12h' | '24h';

  // One-time welcome-tour flag; the client only ever sets this to true.
  @IsOptional()
  @IsBoolean()
  guidesSeen?: boolean;

  // The language pushes and bell entries are written in for this member.
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: SupportedLocale;

  // Several workspaces: clock in where they stand ('AUTO') or always choose ('ASK').
  @IsOptional()
  @IsIn(CLOCK_IN_PICK_MODES)
  clockInPick?: ClockInPick;

  // An administrator switching their own clock on or off (refused for anyone else in auth-service).
  @IsOptional()
  @IsBoolean()
  usesClock?: boolean;
}

class UpdateMyEmailDto {
  @IsEmail({}, { message: 'A valid email is required' })
  newEmail: string;

  @IsString()
  @IsNotEmpty({ message: 'Current password is required' })
  currentPassword: string;
}

/**
 * A member's own notification switches. Declared as a class so the global
 * ValidationPipe checks it — a bare `{ prefs?: … }` type is not validated at
 * all. Which KEYS may be stored is decided in auth-service against
 * MEMBER_NOTIFICATION_PREF_KEYS; anything else is dropped there.
 */
/**
 * Mark notifications read: all of them (no `ids`), or the ones named.
 *
 * This was a bare `{ ids?: string[] }` type, which the ValidationPipe cannot
 * see — so `{"ids":"x"}` or `{"ids":[{}]}` reached the database query and came
 * back a 500. A malformed body is the caller's mistake: a 400.
 */
export class MarkNotificationsReadDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  ids?: string[];
}

class UpdateMyNotificationPrefsDto {
  @IsOptional()
  @IsObject()
  prefs?: Record<string, boolean>;
}

export { RegisterPushTokenDto, UpdateMeDto, UpdateMyEmailDto, UpdateMyNotificationPrefsDto };
