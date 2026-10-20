/** task-service: the automatic clock — plan, consent, undo, skip the rest. */
import { rpc } from '../contract';
import type { OccurrenceEvidence } from '../../sync/occurrence';

export const autoClockPlan = rpc<{ userId: string; organizationId: string }>('auto_clock_plan');

export const autoClockConsent = rpc<{ userId: string; organizationId: string; consent: boolean }>('auto_clock_consent');

export const autoClockUndo = rpc<{
  userId: string;
  organizationId: string;
  entryId: string;
  evidence?: OccurrenceEvidence;
}>('auto_clock_undo');

export const autoClockSkipRest = rpc<{
  userId: string;
  organizationId: string;
  entryId: string;
  evidence?: OccurrenceEvidence;
}>('auto_clock_skip_rest');
