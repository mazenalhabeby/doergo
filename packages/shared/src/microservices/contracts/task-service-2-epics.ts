import { rpc } from '../contract';
import type { PlanningItemInputMessage } from './task-service-2-types';

/** task-service `epics` handlers — the request each one reads. */

export const findAllEpics = rpc<{ organizationId: string }>('find_all_epics');
export const findEpic = rpc<{ id: string; organizationId: string }>('find_epic');
export const createEpic = rpc<
  PlanningItemInputMessage & { name: string; spaceId?: null | string; targetDate?: string; organizationId: string }
>('create_epic');
export const updateEpic = rpc<
  PlanningItemInputMessage & { id: string; organizationId: string; status?: string; targetDate?: string }
>('update_epic');
export const deleteEpic = rpc<{ id: string; organizationId: string }>('delete_epic');
