/** task-service: jobs that repeat by themselves. */
import { rpc } from '../contract';

export const findAllRecurringTasks = rpc<{
  organizationId: string;
  limit?: number;
  offset?: number;
  scopeSpaceIds?: string[];
}>('find_all_recurring_tasks');

export const createRecurringTask = rpc<{
  title: string;
  description?: string;
  priority?: string;
  spaceId?: string;
  workflowId?: string;
  customerId?: string;
  locationLat?: number;
  locationLng?: number;
  locationAddress?: string;
  assigneeIds?: string[];
  estimatedHours?: number;
  checklist?: { text: string }[];
  frequency: string;
  customDays?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  startDate: string;
  endDate?: string;
  organizationId: string;
  createdById: string;
}>('create_recurring_task');

export const updateRecurringTask = rpc<{
  id: string;
  organizationId: string;
  title?: string;
  description?: string;
  priority?: string;
  spaceId?: string | null;
  workflowId?: string | null;
  customerId?: string | null;
  locationLat?: number;
  locationLng?: number;
  locationAddress?: string;
  assigneeIds?: string[];
  estimatedHours?: number;
  checklist?: { text: string }[];
  frequency?: string;
  customDays?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  endDate?: string;
  isActive?: boolean;
}>('update_recurring_task');

export const deleteRecurringTask = rpc<{ id: string; organizationId: string }>('delete_recurring_task');

export const generateRecurringTask = rpc<{ id: string; organizationId: string; userId: string }>(
  'generate_recurring_task',
);
