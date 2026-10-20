import { BadRequestException } from '@nestjs/common';
import {
  readAutoClockSettings,
  type AutoClockSettings,
  parseCurrency,
  CURRENCY_INVALID_MESSAGE,
} from '@hbcfield/shared';

// tz-lookup: offline coords → IANA timezone (no types pkg).
const tzlookup: (lat: number, lon: number) => string = require('tz-lookup');

/** Derive a space's IANA timezone from its coordinates (null when unavailable). */
function tzFromCoords(lat?: number | null, lng?: number | null): string | null {
  if (lat == null || lng == null || (lat === 0 && lng === 0)) return null;
  try {
    return tzlookup(lat, lng);
  } catch {
    return null;
  }
}

// Valid schedule days
const VALID_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/** A workspace currency as stored: a supported code, or null for the organization's. Anything else is refused. */
function spaceCurrency(value: unknown): string | null {
  const parsed = parseCurrency(value, { optional: true });
  if (!parsed.ok) throw new BadRequestException(CURRENCY_INVALID_MESSAGE);
  return parsed.currency;
}

/** A workspace's automatic-clock settings as every read returns them: parsed with the defaults, or null when never configured. */
function readAutoClock(raw: unknown): AutoClockSettings | null {
  return raw == null ? null : readAutoClockSettings(raw);
}

/** A rota's days must be MON…SUN; anything else is refused, naming the bad days. */
function assertValidScheduleDays(schedule: string[] | null | undefined): void {
  if (!schedule || schedule.length === 0) return;
  const invalidDays = schedule.filter((day) => !VALID_DAYS.includes(day));
  if (invalidDays.length > 0) {
    throw new BadRequestException(
      `Invalid schedule days: ${invalidDays.join(', ')}. Valid days: ${VALID_DAYS.join(', ')}`,
    );
  }
}

export { tzlookup, tzFromCoords, VALID_DAYS, assertValidScheduleDays, spaceCurrency, readAutoClock };
