/** A workspace's automatic-clock settings: their shape, defaults, limits and parsing. */

/** Per-workspace settings. */
export interface AutoClockSettings {
  enabled: boolean;
  /** Auto clock-in only from this many minutes before the shift starts. */
  leadMinutes: number;
  /** …and only after staying inside this long (a drive-past is not an arrival). */
  dwellMinutes: number;
  /** After the shift's end, leaving the area clocks out once outside this long. */
  exitGraceMinutes: number;
  /** A rest started automatically mid-shift when none was taken (null = off). */
  autoRestMinutes: number | null;
  /** Still inside after the end: the leader is told after this many minutes (online). */
  leaderAfterMinutes: number;
  /** Nobody answered: the server closes the shift (provisionally) after this many minutes. */
  closeAfterMinutes: number;
}

export const AUTO_CLOCK_DEFAULTS: AutoClockSettings = {
  enabled: false,
  leadMinutes: 30,
  dwellMinutes: 3,
  exitGraceMinutes: 10,
  autoRestMinutes: null,
  leaderAfterMinutes: 25,
  closeAfterMinutes: 60,
};

export const AUTO_CLOCK_LIMITS = {
  leadMinutes: [0, 180],
  dwellMinutes: [0, 30],
  exitGraceMinutes: [0, 60],
  autoRestMinutes: [10, 120],
  leaderAfterMinutes: [5, 240],
  closeAfterMinutes: [15, 720],
} as const;

export type AutoClockSettingsError = 'AUTO_CLOCK_SETTING_INVALID';

/**
 * Read stored or submitted settings. Stored: missing fields take the defaults.
 * Submitted (`strict`): an out-of-range number is refused, never clamped —
 * the office should see that 500 minutes was not saved as 180.
 */
export function parseAutoClockSettings(
  raw: unknown,
  opts: { strict?: boolean } = {},
): { ok: true; value: AutoClockSettings } | { ok: false; code: AutoClockSettingsError; field: string } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: AutoClockSettings = { ...AUTO_CLOCK_DEFAULTS, enabled: b.enabled === true };
  for (const [field, [min, max]] of Object.entries(AUTO_CLOCK_LIMITS) as [keyof typeof AUTO_CLOCK_LIMITS, readonly [number, number]][]) {
    const v = b[field];
    if (v === undefined) continue;
    if (field === 'autoRestMinutes' && v === null) {
      out.autoRestMinutes = null;
      continue;
    }
    const n = typeof v === 'number' && Number.isInteger(v) ? v : NaN;
    if (!(n >= min && n <= max)) {
      if (opts.strict) return { ok: false, code: 'AUTO_CLOCK_SETTING_INVALID', field };
      continue;
    }
    (out as unknown as Record<string, number | null>)[field] = n;
  }
  if (out.closeAfterMinutes <= out.leaderAfterMinutes) {
    if (opts.strict) return { ok: false, code: 'AUTO_CLOCK_SETTING_INVALID', field: 'closeAfterMinutes' };
    out.closeAfterMinutes = Math.max(AUTO_CLOCK_DEFAULTS.closeAfterMinutes, out.leaderAfterMinutes + 15);
  }
  return { ok: true, value: out };
}

/** Stored settings as every reader takes them: never fails, defaults filled in, an out-of-range value ignored. */
export function readAutoClockSettings(raw: unknown): AutoClockSettings {
  const parsed = parseAutoClockSettings(raw);
  return parsed.ok ? parsed.value : { ...AUTO_CLOCK_DEFAULTS };
}
