/** task-service: shift issues members report. */
import { rpc } from '../contract';
import type { ShiftIssueAttachment } from './task-service-types';

export const shiftIssueCreate = rpc<{
  organizationId: string;
  callerUserId: string;
  title: string;
  description?: string;
  severity?: string;
  timeEntryId?: string;
  spaceId?: string;
  attachments?: ShiftIssueAttachment[];
  id?: string;
}>('shift_issue_create');

export const shiftIssueList = rpc<{
  organizationId: string;
  callerUserId: string;
  canManage?: boolean;
  ledSpaceIds?: string[];
  status?: string;
  scope?: string;
}>('shift_issue_list');

export const shiftIssueGet = rpc<{
  organizationId: string;
  issueId: string;
  callerUserId: string;
  canManage?: boolean;
  ledSpaceIds?: string[];
}>('shift_issue_get');

export const shiftIssueMessage = rpc<{
  organizationId: string;
  issueId: string;
  callerUserId: string;
  canManage?: boolean;
  ledSpaceIds?: string[];
  body?: string;
  attachments?: ShiftIssueAttachment[];
  id?: string;
}>('shift_issue_message');

export const shiftIssueAcknowledge = rpc<{
  organizationId: string;
  issueId: string;
  callerUserId: string;
  canManage?: boolean;
  ledSpaceIds?: string[];
}>('shift_issue_acknowledge');

export const shiftIssueAssign = rpc<{
  organizationId: string;
  issueId: string;
  callerUserId: string;
  canManage?: boolean;
  ledSpaceIds?: string[];
  assignToId: string;
}>('shift_issue_assign');

export const shiftIssueStatus = rpc<{
  organizationId: string;
  issueId: string;
  callerUserId: string;
  canManage?: boolean;
  ledSpaceIds?: string[];
  status: string;
  note?: string;
}>('shift_issue_status');

export const shiftIssuePresign = rpc<{
  organizationId: string;
  issueId: string;
  callerUserId: string;
  canManage?: boolean;
  ledSpaceIds?: string[];
  fileName: string;
  mimeType: string;
}>('shift_issue_presign');
