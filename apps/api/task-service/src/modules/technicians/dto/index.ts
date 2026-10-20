/**
 * The technicians module's message shapes. They live with the message contracts
 * (packages/shared/src/microservices/contracts/task-service-technicians-types.ts)
 * so the gateway and this service read one definition; the old names stay here.
 */
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
} from '@hbcfield/shared/microservices';

export type GetEmployeeStatsDto = GetEmployeeStatsMessage;
export type GetEmployeePerformanceDto = GetEmployeePerformanceMessage;
export type GetEmployeeTaskHistoryDto = GetEmployeeTaskHistoryMessage;
export type SetScheduleDto = SetScheduleMessage;
export type GetScheduleDto = GetScheduleMessage;
export type RequestTimeOffDto = RequestTimeOffMessage;
export type GetTimeOffDto = GetTimeOffMessage;
export type GetOrgTimeOffDto = GetOrgTimeOffMessage;
export type ApproveTimeOffDto = ApproveTimeOffMessage;
export type CancelTimeOffDto = CancelTimeOffMessage;
export type GetAvailabilityDto = GetAvailabilityMessage;
