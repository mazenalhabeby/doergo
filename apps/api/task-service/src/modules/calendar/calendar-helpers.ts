/** Module-level helpers of calendar.service.ts — moved here unchanged. */
import { TaskStatus } from '@hbcfield/shared';
import { type Caller } from './events.service';
import type { CalendarItemsQuery } from '@hbcfield/shared/microservices';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/*
  Jobs the calendar leaves OUT: canceled only — NOT the shared TERMINAL_STATUSES.
  A finished job stays on the day it was done; a canceled one never happened.
  'CANCELLED' is the spelling some custom workflows use for their step key.
*/
const CANCELED_TASK_KEYS: string[] = [TaskStatus.CANCELED, 'CANCELLED'];

export type ItemsQuery = CalendarItemsQuery;

export { DATE, CANCELED_TASK_KEYS };
