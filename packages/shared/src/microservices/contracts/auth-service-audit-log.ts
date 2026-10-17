/** Message contracts for auth-service `audit-log` handlers (types only — the wire is the cmd string). */
import { rpc } from '../contract';

export const auditLogWrite = rpc<{
  eventType: string;
  userId?: string;
  targetUserId?: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  organizationId: string;
}>('audit_log_write');
export const auditLogList = rpc<{
  organizationId: string;
  eventType?: string;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  viewerId?: string;
}>('audit_log_list');
