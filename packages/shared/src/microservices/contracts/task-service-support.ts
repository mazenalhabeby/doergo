import { rpc } from '../contract';
import type { SupportAgentScope } from '../../platform/support-scope';
import type { SupportAttachmentMessage } from './task-service-types';

/** task-service `support` handlers — the request each one reads. */

export const supportCreate = rpc<{
  organizationId: string;
  createdById: string;
  orgAddOns?: null | string[];
  subject: string;
  category?: string;
  channel?: string;
  body: string;
  attachments?: SupportAttachmentMessage[];
  id?: string;
}>('support.create');
export const supportAddMessage = rpc<{
  ticketId: string;
  authorId: string;
  authorType: 'CUSTOMER' | 'AGENT' | 'SYSTEM';
  body: string;
  attachments?: SupportAttachmentMessage[];
  isInternalNote?: boolean;
  organizationId?: string;
  userId?: string;
  asAgent?: boolean;
  scope?: SupportAgentScope;
  id?: string;
}>('support.addMessage');
export const supportAssign = rpc<{
  ticketId: string;
  agentId?: null | string;
  teamId?: null | string;
  scope?: SupportAgentScope;
}>('support.assign');
export const supportSetStatus = rpc<{
  ticketId: string;
  status: 'OPEN' | 'PENDING_AGENT' | 'PENDING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
  scope?: SupportAgentScope;
}>('support.setStatus');
export const supportMarkRead = rpc<{
  ticketId: string;
  reader: 'CUSTOMER' | 'AGENT';
  userId?: string;
  scope?: SupportAgentScope;
}>('support.markRead');
export const supportList = rpc<{ createdById: string; status?: string; page?: number; limit?: number }>('support.list');
export const supportThread = rpc<{
  ticketId: string;
  organizationId?: string;
  userId?: string;
  asAgent?: boolean;
  scope?: SupportAgentScope;
}>('support.thread');
export const supportInbox = rpc<{
  status?: string;
  tier?: string;
  atRisk?: boolean;
  page?: number;
  limit?: number;
  isSupervisor?: boolean;
  teamIds?: string[];
  agentId?: string;
  view?: 'all' | 'mine' | 'unassigned' | 'team';
}>('support.inbox');
