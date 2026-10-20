import { rpc } from '../contract';
import type { SpaceScopeIds } from '../../access/space-scope';
import type { ReportDefinitionMessage, ReportScheduleInputMessage } from './task-service-types';

/** task-service `analytics` handlers — the request each one reads. */

export const analyticsCatalog = rpc<unknown>('analytics_catalog');
export const analyticsRun = rpc<{
  organizationId: string;
  definition: ReportDefinitionMessage;
  scopeSpaceIds?: SpaceScopeIds;
}>('analytics_run');
export const analyticsTimesheet = rpc<{
  organizationId: string;
  userId: string;
  from?: string;
  to?: string;
  scopeSpaceIds?: SpaceScopeIds;
}>('analytics_timesheet');
export const analyticsListSaved = rpc<{ organizationId: string; userId: string }>('analytics_list_saved');
export const analyticsCreateSaved = rpc<{
  organizationId: string;
  userId: string;
  name: string;
  description?: string;
  config: ReportDefinitionMessage;
  isShared?: boolean;
}>('analytics_create_saved');
export const analyticsUpdateSaved = rpc<{
  id: string;
  organizationId: string;
  userId: string;
  isAdmin?: boolean;
  name?: string;
  description?: string;
  config?: ReportDefinitionMessage;
  isShared?: boolean;
}>('analytics_update_saved');
export const analyticsDeleteSaved = rpc<{ id: string; organizationId: string; userId?: string; isAdmin?: boolean }>(
  'analytics_delete_saved',
);
export const analyticsListSchedules = rpc<{ organizationId: string; reportDefinitionId?: string }>(
  'analytics_list_schedules',
);
export const analyticsCreateSchedule = rpc<
  { organizationId: string; userId: string; reportDefinitionId: string } & ReportScheduleInputMessage
>('analytics_create_schedule');
export const analyticsUpdateSchedule = rpc<
  { id: string; organizationId: string } & {
    cadence?: 'daily' | 'weekly' | 'monthly';
    hour?: number;
    dayOfWeek?: null | number;
    dayOfMonth?: null | number;
    recipients?: string[];
    isActive?: boolean;
  }
>('analytics_update_schedule');
export const analyticsDeleteSchedule = rpc<{ id: string; organizationId: string }>('analytics_delete_schedule');
