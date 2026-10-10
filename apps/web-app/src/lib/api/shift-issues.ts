import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { ShiftIssue, ShiftIssueEvent, WorkLogAttachmentInput } from './types/shift-issues';
import { shiftIssuesEndpoints } from '@hbcfield/shared/client';

export const shiftIssuesApi = {
  list: async (params?: { status?: string; scope?: string }): Promise<ShiftIssue[]> => {
    const res = await call(shiftIssuesEndpoints.list, undefined, { query: { status: params?.status || undefined, scope: params?.scope || undefined } }) as ApiResponse<{ data: ShiftIssue[] }>
    if (res.error) throw apiError(res)
    return res.data?.data ?? []
  },
  get: async (id: string): Promise<ShiftIssue> => {
    const res = await call(shiftIssuesEndpoints.get, { id }) as ApiResponse<{ data: ShiftIssue }>
    if (res.error) throw apiError(res)
    return res.data!.data
  },
  create: async (input: { title: string; description?: string; severity?: string; timeEntryId?: string; spaceId?: string; attachments?: WorkLogAttachmentInput[] }): Promise<ShiftIssue> => {
    const res = await call(shiftIssuesEndpoints.create, undefined, { body: input }) as ApiResponse<{ data: ShiftIssue }>
    if (res.error) throw apiError(res)
    return res.data!.data
  },
  message: async (id: string, input: { body?: string; attachments?: WorkLogAttachmentInput[] }): Promise<ShiftIssueEvent> => {
    const res = await call(shiftIssuesEndpoints.message, { id }, { body: input }) as ApiResponse<{ data: ShiftIssueEvent }>
    if (res.error) throw apiError(res)
    return res.data!.data
  },
  acknowledge: async (id: string) => {
    const res = await call(shiftIssuesEndpoints.acknowledge, { id }, { body: {} }) as ApiResponse<{ data: ShiftIssue }>
    if (res.error) throw apiError(res)
    return res.data!.data
  },
  assign: async (id: string, assignToId: string) => {
    const res = await call(shiftIssuesEndpoints.assign, { id }, { body: { assignToId } }) as ApiResponse<{ data: ShiftIssue }>
    if (res.error) throw apiError(res)
    return res.data!.data
  },
  setStatus: async (id: string, status: string, note?: string) => {
    const res = await call(shiftIssuesEndpoints.setStatus, { id }, { body: { status, note } }) as ApiResponse<{ data: ShiftIssue }>
    if (res.error) throw apiError(res)
    return res.data!.data
  },
  presignAttachment: async (id: string, fileName: string, mimeType: string) => {
    const res = await call(shiftIssuesEndpoints.attachmentPresign, { id }, { body: { fileName, mimeType } }) as ApiResponse<{ data: { uploadUrl: string; fileKey: string; fileUrl: string; expiresIn: number; maxFileSize: number } }>
    if (res.error) throw apiError(res)
    return res.data!.data
  },
}
