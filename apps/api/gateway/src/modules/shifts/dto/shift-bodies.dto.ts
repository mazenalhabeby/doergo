import { OptArray, OptBoolean, OptIn, OptNumber, OptString, OptStrings } from '../../../common/dto/body-fields';

/*
  Shift and rota bodies (CODE_AUDIT.md B3). Clients: the web's shift dialog and rota dialog
  (lib/api/shifts.ts, rota.ts) and the phone's rota day editor. Only TYPES are checked; the
  service keeps every rule. ⚠️ The edit forms RE-SEND fields the update does not take
  (a shift's `spaceId`, a rota row's `userId`) — declared here so the whitelist lets them through.
*/

/** POST /shifts */
export class CreateShiftDto {
  @OptString() spaceId?: string | null;
  @OptString() name!: string;
  @OptString() description?: string;
  @OptString() color?: string;
  @OptString() startLocal!: string;
  @OptString() endLocal!: string;
  @OptNumber() breakMinutes?: number;
  @OptNumber() graceMin?: number;
  @OptNumber() reminderIntervalMin?: number;
  @OptNumber() maxReminders?: number;
  @OptNumber() flagToleranceMin?: number;
}

/** PATCH /shifts/:id — the dialog sends the create form again (spaceId included) + isActive. */
export class UpdateShiftDto {
  @OptString() spaceId?: string | null;
  @OptString() name?: string;
  @OptString() description?: string;
  @OptString() color?: string;
  @OptString() startLocal?: string;
  @OptString() endLocal?: string;
  @OptNumber() breakMinutes?: number;
  @OptNumber() graceMin?: number;
  @OptNumber() reminderIntervalMin?: number;
  @OptNumber() maxReminders?: number;
  @OptNumber() flagToleranceMin?: number;
  @OptBoolean() isActive?: boolean;
}

/** POST /rota/day — the phone's day editor. */
export class SetRotaDayDto {
  @OptString() spaceId!: string;
  @OptString() userId!: string;
  @OptString() date!: string;
  @OptString() shiftId?: string | null;
  @OptIn(['once', 'weekly']) repeat!: 'once' | 'weekly';
}

/** POST /spaces/:spaceId/rota */
export class CreateRotaDto {
  @OptString() userId!: string;
  @OptString() shiftId!: string;
  @OptString() recurrence!: string;
  @OptArray() daysOfWeek?: number[];
  @OptArray() daysOfMonth?: number[];
  @OptStrings() dates?: string[];
  @OptString() effectiveFrom?: string;
  @OptString() effectiveTo?: string | null;
  @OptNumber() priority?: number;
}

/** PATCH /rota/:id — the dialog sends the create form again (userId included) + isActive. */
export class UpdateRotaDto {
  @OptString() userId?: string;
  @OptString() shiftId?: string;
  @OptString() recurrence?: string;
  @OptArray() daysOfWeek?: number[];
  @OptArray() daysOfMonth?: number[];
  @OptStrings() dates?: string[];
  @OptString() effectiveFrom?: string;
  @OptString() effectiveTo?: string | null;
  @OptNumber() priority?: number;
  @OptBoolean() isActive?: boolean;
}
