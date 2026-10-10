

// ── Shift scheduling (space-centric attendance) ──────────────────────────────

export interface CreateShiftInput {
  spaceId?: string | null;
  name: string;
  description?: string;
  color?: string;
  startLocal: string;
  endLocal: string;
  breakMinutes?: number;
  graceMin?: number;
  reminderIntervalMin?: number;
  maxReminders?: number;
  flagToleranceMin?: number;
}
