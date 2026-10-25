import { call, type ApiResponse } from "../http-client"
import { apiError } from "../server-error"
import type { OvertimeRequest, OvertimeRoundDetail, PaginationMeta } from "./types/overtime"
import {
  attendanceEndpoints,
  overtimeEndpoints,
  type OutsideShiftWaiting,
  type OvertimeSummary,
} from "@hbcfield/shared/client"

export const overtimeApi = {
  /** The caller's own time outside the shift waiting for a decision, and whom it waits for (clock review C10). */
  outsideMine: async () => {
    const response = (await call(overtimeEndpoints.outsideMine)) as ApiResponse<{ data?: OutsideShiftWaiting[] }>
    if (response.error) throw apiError(response)
    const rows = response.data?.data ?? (response.data as unknown)
    return Array.isArray(rows) ? (rows as OutsideShiftWaiting[]) : []
  },

  getPendingApprovals: async () => {
    const response = (await call(overtimeEndpoints.pendingApprovals)) as ApiResponse<{
      success: boolean
      data: OvertimeRequest[]
    }>
    if (response.error) throw apiError(response)
    return response.data?.data || []
  },

  approve: async (id: string, data: { maxDurationMinutes: number; notes?: string }) => {
    const response = (await call(overtimeEndpoints.approve, { id }, { body: data })) as ApiResponse<{
      success: boolean
      data: OvertimeRequest
    }>
    if (response.error) throw apiError(response)
    return response.data?.data
  },

  reject: async (id: string, data: { reason: string }) => {
    const response = (await call(overtimeEndpoints.reject, { id }, { body: data })) as ApiResponse<{
      success: boolean
      data: OvertimeRequest
    }>
    if (response.error) throw apiError(response)
    return response.data?.data
  },
  /** Remove an approved overtime as if it never was: the shift end moves back and the day is recounted. */
  remove: async (id: string) => {
    const response = (await call(attendanceEndpoints.removeOvertime, { id })) as ApiResponse<{ success: boolean }>
    if (response.error) throw apiError(response)
    return response.data
  },

  getHistory: async (params?: {
    technicianId?: string
    spaceId?: string
    status?: string
    from?: string
    to?: string
    page?: number
    limit?: number
  }) => {
    const response = (await call(overtimeEndpoints.history, undefined, {
      query: {
        technicianId: params?.technicianId,
        spaceId: params?.spaceId,
        status: params?.status,
        from: params?.from,
        to: params?.to,
        page: params?.page,
        limit: params?.limit,
      },
    })) as ApiResponse<{ success: boolean; data: { data: OvertimeRequest[]; meta: PaginationMeta } }>
    if (response.error) throw apiError(response)
    return response.data?.data
  },

  /** The period's numbers, who is running now, and per person. */
  getSummary: async (params: { from: string; to: string; spaceId?: string; technicianId?: string }) => {
    const response = (await call(overtimeEndpoints.summary, undefined, { query: params })) as ApiResponse<{
      success: boolean
      data: OvertimeSummary
    }>
    if (response.error) throw apiError(response)
    return response.data?.data as OvertimeSummary
  },

  /** One round in full, with its signature. */
  getRound: async (id: string) => {
    const response = (await call(overtimeEndpoints.round, { id })) as ApiResponse<{
      success: boolean
      data: OvertimeRoundDetail
    }>
    if (response.error) throw apiError(response)
    return response.data?.data as OvertimeRoundDetail
  },
}
