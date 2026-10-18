import { OptBoolean, OptIn, OptNumber, OptString } from '../../../common/dto/body-fields';

/*
  Bodies of the attendance decisions that used to be plain interfaces (CODE_AUDIT.md B3).
  Every field a client sends is declared — web, phone and the approvals inbox
  (packages/shared/src/approvals/kinds/kind-routes.ts) — and only its TYPE is checked:
  the service still refuses a missing or out-of-range value with its own coded message.
  A field the old interface called required keeps `!` (same TypeScript type as before);
  its validator stays optional so a missing one reaches the service exactly as it did.
*/

/** PATCH /attendance/no-shows/:id */
export class ResolveNoShowDto {
  @OptIn(['excuse', 'absent', 'reopen']) action!: 'excuse' | 'absent' | 'reopen';
  @OptString() reasonCode?: string;
  @OptString() reason?: string;
  @OptBoolean() wholeRun?: boolean;
}

/** POST /attendance/breaks/:id/end · POST /attendance/approvals/:id/approve */
export class DecisionNotesDto {
  @OptString() notes?: string;
}

/** POST /attendance/approvals/:id/reject */
export class RejectEntryDto {
  @OptString() reason!: string;
}

/** POST /attendance/excursions/report */
export class ReportExcursionDto {
  @OptString() reason!: string;
  @OptNumber() requestedMinutes!: number;
}

/** PATCH /attendance/excursions/:id/approve */
export class ApproveExcursionDto {
  @OptNumber() grantedMinutes?: number;
}

/** POST /attendance/entries/:id/forgot-clock-out */
export class ForgotClockOutDto {
  @OptString() clockOutAt!: string;
}

/** PUT /attendance/entries/:id/edit */
export class EditEntryDto {
  @OptString() clockInAt?: string;
  @OptString() clockOutAt?: string;
  @OptString() notes?: string;
  @OptString() timezone?: string;
  @OptString() reason!: string;
}
