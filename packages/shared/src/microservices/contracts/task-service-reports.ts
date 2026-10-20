import { rpc } from '../contract';

/** task-service `reports` handlers — the request each one reads. */

export const getTaskReport = rpc<{ taskId: string; userId: string; userRole: string; organizationId: string }>(
  'get_task_report',
);
export const getAssetReports = rpc<{
  assetId: string;
  page?: number;
  limit?: number;
  userId: string;
  userRole: string;
  canViewAllTasks?: boolean;
  organizationId: string;
}>('get_asset_reports');
