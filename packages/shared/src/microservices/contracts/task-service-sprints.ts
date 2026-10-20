import { rpc } from '../contract';

/** task-service `sprints` handlers — the request each one reads. */

export const findAllSprints = rpc<{ organizationId: string; status?: string }>('find_all_sprints');
export const findSprint = rpc<{ id: string; organizationId: string }>('find_sprint');
export const createSprint = rpc<{
  name: string;
  spaceId?: null | string;
  goal?: string;
  startDate: string;
  endDate: string;
  position?: number;
  organizationId: string;
}>('create_sprint');
export const updateSprint = rpc<{
  id: string;
  organizationId: string;
  name?: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
  position?: number;
}>('update_sprint');
export const startSprint = rpc<{ id: string; organizationId: string }>('start_sprint');
export const completeSprint = rpc<{ id: string; organizationId: string }>('complete_sprint');
export const deleteSprint = rpc<{ id: string; organizationId: string }>('delete_sprint');
export const getSprintReport = rpc<{ id: string; organizationId: string }>('get_sprint_report');
export const getVelocity = rpc<{ organizationId: string; limit?: number }>('get_velocity');
