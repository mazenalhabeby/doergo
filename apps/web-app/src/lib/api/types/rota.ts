

export interface CreateRotaInput {
  userId: string;
  shiftId: string;
  recurrence: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ONE_OFF';
  daysOfWeek?: number[];
  daysOfMonth?: number[];
  dates?: string[];
  effectiveFrom?: string;
  effectiveTo?: string | null;
  priority?: number;
}
