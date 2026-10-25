/**
 * How people work at a workspace — ONE question instead of about thirty settings (clock review D1, approved
 * 2026-10-25). Three ready answers that write the columns the clock already reads, so the rules underneath do
 * not change; "Change details" still opens every setting. A worker can be set differently from their workspace
 * ("Works here as"), with their own daily hours.
 *
 *   FIXED_SHIFTS    a rota — clock in on site, at the shift; nobody clocks in without one
 *   FLEXIBLE_HOURS  no shift needed — all of the time counts; past the day's hours it is flagged, never cut
 *   IN_THE_FIELD    no ring — clock in wherever the work is; all of the time counts
 */
import { isGeofencePolicy, type GeofencePolicy } from './away-policy';
import { clampDailyMinutes, isNoShiftPolicy, NO_SHIFT_LIMIT, type NoShiftPolicy } from './no-shift-limit';

export const WORK_PRESETS = ['FIXED_SHIFTS', 'FLEXIBLE_HOURS', 'IN_THE_FIELD'] as const;
export type WorkPreset = (typeof WORK_PRESETS)[number];

export function isWorkPreset(v: unknown): v is WorkPreset {
  return typeof v === 'string' && (WORK_PRESETS as readonly string[]).includes(v);
}

/** What a preset writes — the columns every clock rule already reads. */
export interface ClockRules {
  workModel: 'SHIFT' | 'NONE' | 'FIXED' | 'TASK';
  geofencePolicy: GeofencePolicy;
  noShiftPolicy: NoShiftPolicy;
}

export const PRESET_RULES: Record<WorkPreset, ClockRules> = {
  FIXED_SHIFTS: { workModel: 'SHIFT', geofencePolicy: 'STRICT', noShiftPolicy: 'SHIFT_ONLY' },
  FLEXIBLE_HOURS: { workModel: 'NONE', geofencePolicy: 'STRICT', noShiftPolicy: 'ALLOW' },
  IN_THE_FIELD: { workModel: 'NONE', geofencePolicy: 'NONE', noShiftPolicy: 'ALLOW' },
};

/** The workspace's own columns as the clock reads them. */
export interface WorkspaceClockColumns {
  workModel?: string | null;
  geofencePolicy?: string | null;
  noShiftPolicy?: string | null;
  noShiftDailyMinutes?: number | null;
}

/** Which preset the workspace's columns are — or CUSTOM when somebody changed the details. */
export function presetOfWorkspace(ws: WorkspaceClockColumns): WorkPreset | 'CUSTOM' {
  for (const p of WORK_PRESETS) {
    const r = PRESET_RULES[p];
    if (
      (ws.workModel ?? 'NONE') === r.workModel &&
      (ws.geofencePolicy ?? 'STRICT') === r.geofencePolicy &&
      (ws.noShiftPolicy ?? 'ALLOW') === r.noShiftPolicy
    ) {
      return p;
    }
  }
  return 'CUSTOM';
}

/** What one worker clocks by at one workspace — never null, an unknown value already read as its default. */
export interface EffectiveClockRules {
  workModel: string;
  geofencePolicy: GeofencePolicy;
  noShiftPolicy: NoShiftPolicy;
  noShiftDailyMinutes: number;
  /** Set differently from the workspace ("Own rules" on the screens). */
  ownRules: boolean;
}

/** A worker's own way of working there — null = the same as the workspace. */
export interface AssignmentClockColumns {
  workAs?: string | null;
  workDailyMinutes?: number | null;
}

/**
 * The rules ONE worker clocks by at ONE workspace: the workspace's columns, unless the assignment says
 * "works here as" another preset (its rules) and/or its own daily hours. Every clock path asks this —
 * clock-in, the clock-in list, the phone's offline check through the status read — so a worker's own rules
 * cannot be honoured in one place and not another.
 */
export function effectiveClockRules(
  ws: WorkspaceClockColumns,
  assignment?: AssignmentClockColumns | null,
): EffectiveClockRules {
  const preset = isWorkPreset(assignment?.workAs) ? PRESET_RULES[assignment!.workAs as WorkPreset] : null;
  const ownMinutes =
    assignment?.workDailyMinutes != null && Number.isFinite(assignment.workDailyMinutes)
      ? clampDailyMinutes(assignment.workDailyMinutes)
      : null;
  return {
    workModel: preset?.workModel ?? ws.workModel ?? 'NONE',
    geofencePolicy: preset?.geofencePolicy ?? (isGeofencePolicy(ws.geofencePolicy) ? ws.geofencePolicy : 'STRICT'),
    noShiftPolicy: preset?.noShiftPolicy ?? (isNoShiftPolicy(ws.noShiftPolicy) ? ws.noShiftPolicy : 'ALLOW'),
    noShiftDailyMinutes: ownMinutes ?? ws.noShiftDailyMinutes ?? NO_SHIFT_LIMIT.DEFAULT_MINUTES,
    ownRules: !!preset || ownMinutes != null,
  };
}
