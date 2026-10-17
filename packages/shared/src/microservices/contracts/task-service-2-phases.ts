import { rpc } from '../contract';
import type { PlanningItemInputMessage } from './task-service-2-types';

/** task-service `phases` handlers — the request each one reads. */

export const findAllPhases = rpc<{ organizationId: string }>('find_all_phases');
export const findPhase = rpc<{ id: string; organizationId: string }>('find_phase');
export const createPhase = rpc<
  PlanningItemInputMessage & {
    name: string;
    spaceId?: null | string;
    type?: string;
    endDate?: string;
    organizationId: string;
  }
>('create_phase');
export const updatePhase = rpc<
  PlanningItemInputMessage & { id: string; organizationId: string; type?: string; endDate?: string; isActive?: boolean }
>('update_phase');
export const deletePhase = rpc<{ id: string; organizationId: string }>('delete_phase');
