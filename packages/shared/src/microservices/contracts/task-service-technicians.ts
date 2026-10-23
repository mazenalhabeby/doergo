/** task-service technicians handlers — contracts (request types are what the handler reads). */
import { rpc } from '../contract';
import type {
  GetEmployeeStatsMessage,
  GetEmployeePerformanceMessage,
  GetEmployeeTaskHistoryMessage,
  SetScheduleMessage,
  GetScheduleMessage,
  RequestTimeOffMessage,
  GetTimeOffMessage,
  GetOrgTimeOffMessage,
  ApproveTimeOffMessage,
  CancelTimeOffMessage,
  GetAvailabilityMessage,
} from './task-service-technicians-types';

export const listLeaveAdjustments = rpc<{
  technicianId: string;
  organizationId: string;
  callerId: string;
  scopeSpaceIds?: string[];
  editScope?: 'ORG' | string[] | null;
  on?: string;
  year?: number | string;
}>('list_leave_adjustments');
export const addLeaveAdjustment = rpc<{
  technicianId: string;
  organizationId: string;
  callerId: string;
  scopeSpaceIds?: string[];
  body: unknown;
}>('add_leave_adjustment');
export const voidLeaveAdjustment = rpc<{
  adjustmentId: string;
  organizationId: string;
  callerId: string;
  scopeSpaceIds?: string[];
}>('void_leave_adjustment');
export const getLeaveOpening = rpc<{ organizationId: string; scopeSpaceIds?: string[]; on?: string }>(
  'get_leave_opening',
);
export const saveLeaveOpening = rpc<{
  organizationId: string;
  callerId: string;
  scopeSpaceIds?: string[];
  on?: unknown;
  rows?: unknown;
}>('save_leave_opening');
export const matchLeaveOpening = rpc<{ organizationId: string; scopeSpaceIds?: string[]; text?: unknown }>(
  'match_leave_opening',
);
export const getTechnicianStats = rpc<GetEmployeeStatsMessage>('get_technician_stats');
export const getTechnicianPerformance = rpc<GetEmployeePerformanceMessage>('get_technician_performance');
export const getTechnicianTaskHistory = rpc<GetEmployeeTaskHistoryMessage>('get_technician_task_history');
export const setTechnicianSchedule = rpc<SetScheduleMessage>('set_technician_schedule');
export const getTechnicianSchedule = rpc<GetScheduleMessage>('get_technician_schedule');
export const requestTimeOff = rpc<RequestTimeOffMessage>('request_time_off');
export const requestPrecheck = rpc<{ userId: string; organizationId: string; body: unknown }>('request_precheck');
export const getRequestOptions = rpc<{ userId: string; organizationId: string }>('get_request_options');
export const getTimeOff = rpc<GetTimeOffMessage>('get_time_off');
export const countLeaveRpc = rpc<{
  organizationId: string;
  technicianId: string;
  from: string;
  to: string;
  callerId?: string;
  scopeSpaceIds?: string[];
}>('count_leave');
export const getLeaveBalance = rpc<{
  technicianId: string;
  organizationId: string;
  on?: string;
  year?: number | string;
}>('get_leave_balance');
export const getFloorNow = rpc<{ organizationId: string; scopeSpaceIds?: string[] }>('get_floor_now');
export const getCoverRange = rpc<{ organizationId: string; start: string; end: string; scopeSpaceIds?: string[] }>(
  'get_cover_range',
);
export const getOrgTimeOff = rpc<GetOrgTimeOffMessage & { scopeSpaceIds?: string[]; withCover?: boolean }>(
  'get_org_time_off',
);
export const approveTimeOff = rpc<ApproveTimeOffMessage & { scopeSpaceIds?: string[] }>('approve_time_off');
export const cancelTimeOff = rpc<CancelTimeOffMessage>('cancel_time_off');
export const updateTimeOff = rpc<{
  organizationId: string;
  timeOffId: string;
  startDate?: string;
  endDate?: string;
  reason?: string | null;
}>('update_time_off');
export const adminDeleteTimeOff = rpc<{ organizationId: string; timeOffId: string }>('admin_delete_time_off');
export const addTimeOff = rpc<{
  editorId: string;
  organizationId: string;
  technicianId: string;
  startDate: string;
  endDate: string;
  reason?: string;
}>('add_time_off');
/** The office sets one day's hours for a member: an APPROVED changed-hours request (docs/plans/time-counting-model.md). */
export const setDayHours = rpc<{
  editorId: string;
  organizationId: string;
  technicianId: string;
  scopeSpaceIds?: string[];
  date: string;
  spaceId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
}>('set_day_hours');
/** What the day-hours form shows first: the plan, hours already set, clocked in, leave. */
export const getDayHours = rpc<{
  organizationId: string;
  technicianId: string;
  scopeSpaceIds?: string[];
  date: string;
  spaceId: string;
}>('get_day_hours');
export const getTechniciansAvailability = rpc<GetAvailabilityMessage>('get_technicians_availability');
