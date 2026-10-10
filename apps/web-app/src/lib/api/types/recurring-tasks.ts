

// ============================================================================
// RECURRING TASKS TYPES & API
// ============================================================================

export type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM';


export interface RecurringTaskTemplate {
  id: string;
  organizationId: string;
  spaceId: string | null;
  workflowId: string | null;
  space?: { id: string; name: string } | null;
  workflow?: { id: string; name: string } | null;
  title: string;
  description: string | null;
  priority: string;
  locationAddress: string | null;
  assigneeIds: string[] | null;
  estimatedHours: number | null;
  checklist: { text: string }[] | null;
  frequency: RecurringFrequency;
  customDays: number | null;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  lastGeneratedAt: string | null;
  nextRunAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
