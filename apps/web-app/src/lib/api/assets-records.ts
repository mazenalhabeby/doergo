import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type {
  AssetActivity,
  AssetExpenseStatus,
  AssetListRow,
  AssetLogEntry,
  AssetLogPage,
  AssetLogSummary,
  AssetMoneyEntry,
  AssetMoneySummary,
  CreateAssetLogInput,
  CustodyPeriodDto,
  CustodyTimeline,
} from './types/assets';
import { assetsEndpoints } from '@hbcfield/shared/client';

/** One asset's record: activity, rows, money, the logbook, custody. Part of `assetsApi`, moved here unchanged. */
export const assetRecordsApi = {
  // Get maintenance history for an asset (completed tasks)
  // What happened to one asset — notes people wrote, plus events such as it
  // changing hands.
  getActivities: async (assetId: string) => {
    const response = await call(assetsEndpoints.activities, { id: assetId }) as ApiResponse<{ success: boolean; data: AssetActivity[] }>;
    if (response.error) throw apiError(response);
    return response.data?.data || [];
  },

  addActivity: async (assetId: string, body: string) => {
    const response = await call(assetsEndpoints.addActivity, { id: assetId }, { body: { body } }) as ApiResponse<{ success: boolean; data: AssetActivity }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  // Rows of one table on a record — a machine's parts, an apartment's keys.
  getRows: async (assetId: string, list: string, params?: { search?: string; page?: number; limit?: number }) => {
    const response = await call(assetsEndpoints.rows, { id: assetId }, { query: { list, ...(params ?? {}) } }) as ApiResponse<{ success: boolean; data: AssetListRow[]; meta?: { total: number; page: number; totalPages: number } }>;
    if (response.error) throw apiError(response);
    return { rows: response.data?.data ?? [], meta: response.data?.meta };
  },

  addRow: async (assetId: string, list: string, values: Record<string, string>) => {
    const response = await call(assetsEndpoints.addRow, { id: assetId }, { body: { list, values } }) as ApiResponse<{ success: boolean; data: AssetListRow }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  updateRow: async (assetId: string, rowId: string, values: Record<string, string>) => {
    const response = await call(assetsEndpoints.updateRow, { id: assetId, rowId }, { body: { values } }) as ApiResponse<{ success: boolean; data: AssetListRow }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  removeRow: async (assetId: string, rowId: string) => {
    const response = await call(assetsEndpoints.removeRow, { id: assetId, rowId }) as ApiResponse<{ success: boolean }>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  // The whole breakdown of one record, the path back up, and what it has cost
  // including everything inside it.


  // Money logged against one asset, with the totals for the whole ledger.
  getMoney: async (assetId: string) => {
    const response = await call(assetsEndpoints.money, { id: assetId }) as ApiResponse<{ success: boolean; data: AssetMoneySummary }>;
    if (response.error) throw apiError(response);
    return response.data?.data ?? { entries: [], totals: { inCents: 0, outCents: 0, netCents: 0 } };
  },

  addMoney: async (assetId: string, input: { category: string; amountCents: number; note?: string; occurredAt?: string }) => {
    const response = await call(assetsEndpoints.addMoney, { id: assetId }, { body: input }) as ApiResponse<{ success: boolean; data: AssetMoneyEntry }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  removeMoney: async (assetId: string, entryId: string) => {
    const response = await call(assetsEndpoints.removeMoney, { id: assetId, entryId }) as ApiResponse<{ success: boolean }>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  // ============================================
  // LOGBOOK — what gets done to a thing, and when it is due again
  // ============================================

  /** One page of an asset's log, newest first. `cursor` is the last id of the previous page. */
  getLog: async (
    assetId: string,
    params: { logType?: string; authorId?: string; status?: AssetExpenseStatus; cursor?: string; limit?: number } = {},
  ) => {
    const response = await call(assetsEndpoints.log, { id: assetId }, { query: params }) as ApiResponse<{ success: boolean; data: AssetLogPage }>;
    if (response.error) throw apiError(response);
    return response.data?.data ?? { entries: [], nextCursor: null };
  },

  /** Readings, next due, and who spent what in a period (this month by default). */
  getLogSummary: async (assetId: string, params: { from?: string; to?: string } = {}) => {
    const response = await call(assetsEndpoints.logSummary, { id: assetId }, { query: params }) as ApiResponse<{ success: boolean; data: AssetLogSummary }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  presignLogPhoto: async (assetId: string, input: { logType: string; fileName: string; mimeType: string; occurredAt?: string }) => {
    const response = await call(assetsEndpoints.logPresign, { id: assetId }, { body: input }) as ApiResponse<{ success: boolean; data: { uploadUrl: string; fileKey: string; maxFileSize: number } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  createLogEntry: async (assetId: string, input: CreateAssetLogInput) => {
    const response = await call(assetsEndpoints.addLog, { id: assetId }, { body: input }) as ApiResponse<{ success: boolean; data: AssetLogEntry }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  removeLogEntry: async (assetId: string, entryId: string) => {
    const response = await call(assetsEndpoints.withdrawLog, { id: assetId, entryId }) as ApiResponse<{ success: boolean }>;
    if (response.error) throw apiError(response);
    return response.data;
  },

  // ============================================
  // CUSTODY — who held it, and when
  // ============================================

  /** One asset's timeline, with what it cost during each period. */
  getCustody: async (assetId: string) => {
    const response = await call(assetsEndpoints.custody, { id: assetId }) as ApiResponse<{ success: boolean; data: CustodyTimeline }>;
    if (response.error) throw apiError(response);
    return response.data?.data ?? { periods: [], unattributed: { inCents: 0, outCents: 0, netCents: 0, entries: 0 } };
  },

  /** Everything one member holds or has held — the same rows, read the other way. */
  getMemberCustody: async (memberId: string, openOnly = false) => {
    const response = await call(assetsEndpoints.memberCustody, { memberId }, { query: { open: openOnly ? 'true' : undefined } }) as ApiResponse<{ success: boolean; data: { periods: CustodyPeriodDto[] } }>;
    if (response.error) throw apiError(response);
    return response.data?.data?.periods ?? [];
  },

  /**
   * Hand it over. An empty `to` takes it back to nobody.
   *
   * What this will DO is decided by `planHandover` in shared, which the confirm
   * dialog renders and the server executes — so what somebody agreed to and
   * what was written cannot differ.
   */
  handOver: async (assetId: string, input: { to: Array<{ userId?: string; customerId?: string }>; at?: string; reason?: string }) => {
    const response = await call(assetsEndpoints.handOver, { id: assetId }, { body: input }) as ApiResponse<{ success: boolean; data: { closed: number; opened: number; at: string } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },
};
