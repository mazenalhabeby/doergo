/** task-service misc-2 handlers — contracts (request types are what the handler reads). */
import { rpc } from '../contract';
import type {
  TaskVisibilityFacts,
  SyncPullRequest,
  StandInCaller,
  ApprovalRouteInput,
  ShiftIssueAttachment,
} from './task-service-1-types';
import type { ApprovalStepView, ApprovalRuleView, StandInsResponse, StandInView, ApprovalRouting } from '../../index';
import type { StandInInput } from '../../approvals/approval-routing';
import type { RuleKind, ApprovalRuleInput } from '../../approvals/approval-rules';

export const generateRecurringTask = rpc<{ id: string; organizationId: string; userId: string }>(
  'generate_recurring_task',
);
export const worklogAddNote = rpc<{
  organizationId: string;
  timeEntryId: string;
  callerUserId: string;
  canManage?: boolean;
  manageSpaceIds?: string[];
  body: string;
  at?: string;
  taskId?: string;
  id?: string;
}>('worklog_add_note');
export const worklogAddNotesBatch = rpc<{
  organizationId: string;
  timeEntryId: string;
  callerUserId: string;
  canManage?: boolean;
  manageSpaceIds?: string[];
  notes: Array<{ body: string; at?: string; taskId?: string }>;
}>('worklog_add_notes_batch');
export const worklogList = rpc<{
  organizationId: string;
  timeEntryId: string;
  callerUserId: string;
  canManage?: boolean;
  manageSpaceIds?: string[];
}>('worklog_list');
export const worklogDeleteNote = rpc<{
  organizationId: string;
  noteId: string;
  callerUserId: string;
  canManage?: boolean;
  manageSpaceIds?: string[];
}>('worklog_delete_note');
export const worklogPresignAttachment = rpc<{
  organizationId: string;
  noteId: string;
  callerUserId: string;
  canManage?: boolean;
  manageSpaceIds?: string[];
  fileName: string;
  mimeType: string;
}>('worklog_presign_attachment');
export const worklogConfirmAttachment = rpc<{
  organizationId: string;
  noteId: string;
  callerUserId: string;
  canManage?: boolean;
  manageSpaceIds?: string[];
  fileKey?: string;
  fileUrl?: string;
  fileName: string;
  fileSize?: number;
  mimeType: string;
  width?: number;
  height?: number;
  id?: string;
}>('worklog_confirm_attachment');
export const worklogDeleteAttachment = rpc<{
  organizationId: string;
  attachmentId: string;
  callerUserId: string;
  canManage?: boolean;
  manageSpaceIds?: string[];
}>('worklog_delete_attachment');
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
export const approvalRouteRpc = rpc<
  ApprovalRouteInput & {
    /** Sent by the gateway; the service derives both from `kind` and ignores these. */ decideKey?: unknown;
    orgWide?: unknown;
  },
  ApprovalRouting
>('approval_route');
export const standInsList = rpc<{ caller: StandInCaller }, StandInsResponse>('stand_ins_list');
export const standInsCreate = rpc<{ caller: StandInCaller; input: StandInInput }, StandInView>('stand_ins_create');
export const standInsEnd = rpc<{ caller: StandInCaller; id: string }, { ended: true; toUserId: string }>(
  'stand_ins_end',
);
export const approvalSteps = rpc<
  { organizationId: string; items: Array<{ kind: RuleKind; itemId: string }> },
  ApprovalStepView[]
>('approval_steps');
export const approvalRulesList = rpc<{ organizationId: string }, ApprovalRuleView[]>('approval_rules_list');
export const approvalRulesSave = rpc<
  { organizationId: string; userId: string; input: ApprovalRuleInput; id?: string },
  { id: string }
>('approval_rules_save');
export const approvalRulesDelete = rpc<{ organizationId: string; id: string }, { deleted: true }>(
  'approval_rules_delete',
);
export const syncPull = rpc<SyncPullRequest>('sync_pull');
export const syncMediaLinks = rpc<TaskVisibilityFacts & { ids: string[] }>('sync_media_links');
