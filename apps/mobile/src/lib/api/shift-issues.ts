import type {
  PresignedUpload,
  ShiftIssue,
  ShiftIssueEvent,
  ShiftIssueSeverity,
  ShiftIssueStatus,
} from '@hbcfield/shared/client';
import { call, E } from './client';

// The client already unwraps the { data } envelope.
export type { ShiftIssue, ShiftIssueEvent, ShiftIssueSeverity, ShiftIssueStatus };

/** A photo uploaded for an issue, as its message carries it. */
export interface IssuePhoto {
  fileKey: string;
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  mimeType: string;
  width?: number;
  height?: number;
}

export const shiftIssuesApi = {
  list: async (params?: { status?: string; scope?: string }): Promise<ShiftIssue[]> => {
    return (await call(E.shiftIssues.list, { status: params?.status, scope: params?.scope })) ?? [];
  },
  get: (id: string): Promise<ShiftIssue> => call(E.shiftIssues.get, { id }),
  create: (input: {
    title: string;
    description?: string;
    severity?: string;
    timeEntryId?: string;
    spaceId?: string;
  }): Promise<ShiftIssue> => call(E.shiftIssues.create, undefined, { body: input }),
  message: (id: string, input: { body?: string; attachments?: IssuePhoto[] }): Promise<ShiftIssueEvent> =>
    call(E.shiftIssues.message, { id }, { body: input }),
  acknowledge: (id: string): Promise<ShiftIssue> => call(E.shiftIssues.acknowledge, { id }),
  setStatus: (id: string, status: string, note?: string): Promise<ShiftIssue> =>
    call(E.shiftIssues.setStatus, { id }, { body: { status, note } }),
  presignAttachment: (id: string, fileName: string, mimeType: string): Promise<PresignedUpload & { fileUrl: string }> =>
    call(E.shiftIssues.attachmentPresign, { id }, { body: { fileName, mimeType } }),
};
