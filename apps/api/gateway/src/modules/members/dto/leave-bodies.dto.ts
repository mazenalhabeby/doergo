import { OptAny, OptArray, OptBoolean, OptString } from '../../../common/dto/body-fields';

/*
  Leave, ledger and schedule bodies (CODE_AUDIT.md B3). Clients: the web's leave dialogs,
  the phone's approve call and the approvals inbox ({ approved, rejectionReason? }).
  Only TYPES are checked; parsing and rules stay in task-service.
*/

/** PATCH /employees/time-off/:timeOffId/approve */
export class ApproveTimeOffDto {
  @OptBoolean() approved!: boolean;
  @OptString() rejectionReason?: string;
}

/** POST /employees/time-off/manual */
export class AddTimeOffDto {
  @OptString() technicianId!: string;
  @OptString() startDate!: string;
  @OptString() endDate!: string;
  @OptString() reason?: string;
}

/** PATCH /employees/time-off/:timeOffId */
export class UpdateTimeOffDto {
  @OptString() startDate?: string;
  @OptString() endDate?: string;
  @OptString() reason?: string | null;
}

/** POST /employees/leave-opening/match */
export class MatchLeaveOpeningDto {
  @OptString() text?: string;
}

/** POST /employees/leave-opening — the rows are read by the service's own parser. */
export class SaveLeaveOpeningDto {
  @OptString() on?: string;
  @OptArray() rows?: Array<{ userId: string; used: number; carried: number }>;
}

/**
 * POST /employees/:id/leave-adjustments. `days` is passed AS SENT: parseLeaveAdjustment
 * also reads "1,5" — a number conversion here would turn that into NaN and refuse it.
 */
export class LeaveAdjustmentDto {
  @OptString() kind?: string;
  @OptAny() days?: number | string;
  @OptString() on?: string;
  @OptString() reason?: string | null;
}

/** POST /employees/:id/schedule — the web sends { schedule }; `schedules` is the old endpoint spelling. */
export class SetScheduleDto {
  @OptArray() schedule!: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isActive?: boolean;
    notes?: string;
  }>;
  @OptArray() schedules?: unknown[];
}
