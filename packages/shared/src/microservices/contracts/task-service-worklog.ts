/** task-service: the work log — notes and their attachments. */
import { rpc } from '../contract';

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
