import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type { Asset, AssetActivity, AssetCategory, AssetExpenseStatus, AssetListRow, AssetLogEntry, AssetLogPage, AssetLogSummary, AssetMoneyEntry, AssetMoneySummary, AssetProposal, AssetUsage, AssetsQueryParams, ContractFields, ContractPreview, ContractProposalInput, ContractReading, CreateAssetCategoryInput, CreateAssetInput, CreateAssetLogInput, CustodyPeriodDto, CustodyTimeline, MaintenanceHistoryItem, OrphanAsset, PendingExpense, UpdateAssetCategoryInput, UpdateAssetInput } from './types/assets';
import { assetCategoriesEndpoints, assetsEndpoints } from '@hbcfield/shared/client';

// Assets API methods
export const assetsApi = {
  // ============================================
  // ORPHANS — assets that belong to no space
  // ============================================

  /**
   * Assets no space can show.
   *
   * A type carries the space, so an asset whose type has none (or which lost
   * its type) sits outside every space's Assets tab while still being billed.
   * This is the list that makes them reachable again.
   */
  getOrphans: async () => {
    const response = await call(assetsEndpoints.orphans) as ApiResponse<{ success: boolean; data: OrphanAsset[] }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data ?? [];
  },

  // ============================================
  // BILLING USAGE
  // ============================================

  /**
   * Billable assets per space — `{ total, unassigned, spaces: { [spaceId]: n } }`.
   *
   * Counts only. The ladder that turns them into money lives in
   * `@hbcfield/shared/client`, so the screen and the invoice cannot disagree.
   */
  getUsage: async () => {
    const response = await call(assetsEndpoints.usage) as ApiResponse<{ success: boolean; data: AssetUsage }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data ?? { total: 0, unassigned: 0, spaces: {} };
  },

  // ============================================
  // CATEGORIES
  // ============================================

  // Get all categories for organization
  // Pass a spaceId for THAT space's kinds; omit it for everything the org has.
  getCategories: async (spaceId?: string) => {
    const response = await call(assetCategoriesEndpoints.list, undefined, { query: { spaceId: spaceId || undefined } }) as ApiResponse<{ success: boolean; data: AssetCategory[] }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data || [];
  },

  // Create a new category
  createCategory: async (input: CreateAssetCategoryInput) => {
    const response = await call(assetCategoriesEndpoints.create, undefined, { body: input }) as ApiResponse<{ success: boolean; data: AssetCategory }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Update a category
  updateCategory: async (id: string, input: UpdateAssetCategoryInput) => {
    const response = await call(assetCategoriesEndpoints.update, { id }, { body: input }) as ApiResponse<{ success: boolean; data: AssetCategory }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Delete a category
  deleteCategory: async (id: string) => {
    const response = await call(assetCategoriesEndpoints.remove, { id }) as ApiResponse<{ success: boolean; message: string }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data;
  },

  // ============================================
  // ASSETS
  // ============================================

  // Get all assets with optional filters
  getAssets: async (params?: AssetsQueryParams) => {

    const response = await call(assetsEndpoints.list, undefined, { query: params ?? {} }) as ApiResponse<{
      success: boolean;
      data: Asset[];
      meta: { page: number; limit: number; total: number; totalPages: number };
    }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data;
  },

  // Get a single asset by ID
  getAsset: async (id: string) => {
    const response = await call(assetsEndpoints.get, { id }) as ApiResponse<{ success: boolean; data: Asset }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Create a new asset
  createAsset: async (input: CreateAssetInput) => {
    const response = await call(assetsEndpoints.create, undefined, { body: input }) as ApiResponse<{ success: boolean; data: Asset }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Update an asset
  updateAsset: async (id: string, input: UpdateAssetInput) => {
    const response = await call(assetsEndpoints.update, { id }, { body: input }) as ApiResponse<{ success: boolean; data: Asset }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Delete an asset
  deleteAsset: async (id: string) => {
    const response = await call(assetsEndpoints.remove, { id }) as ApiResponse<{ success: boolean; message: string }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data;
  },

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

  // ============================================
  // PROPOSALS — a member sends a page, the office decides
  // ============================================

  /**
   * Proposals waiting on a decision the caller may make. With a `spaceId`, only
   * THAT workspace's own (its kind is there, or no kind and the member is
   * assigned there) — a workspace's Assets tab. The server narrows; it never widens.
   */
  getPendingProposals: async (spaceId?: string) => {
    const response = await call(assetsEndpoints.pendingProposals, undefined, { query: { spaceId: spaceId || undefined } }) as ApiResponse<{ success: boolean; data: { proposals: AssetProposal[] } }>;
    if (response.error) throw apiError(response);
    return response.data?.data?.proposals ?? [];
  },

  /**
   * Accept it: create the thing, hand it over, retire what it replaces.
   *
   * ⚠️ The plan is built by the server AT THIS MOMENT, from the kind and from
   * what the member holds today — never from anything stored when the page was
   * uploaded. A page sent three weeks ago may name a van since given to
   * somebody else.
   */
  acceptProposal: async (
    id: string,
    input: { categoryId?: string; typeId?: string; fields?: ContractFields; retireReplaced?: boolean },
  ) => {
    const response = await call(assetsEndpoints.acceptProposal, { id }, { body: input }) as ApiResponse<{ success: boolean; data: { id: string; assetId: string | null } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  rejectProposal: async (id: string, note?: string) => {
    const response = await call(assetsEndpoints.rejectProposal, { id }, { body: { note } }) as ApiResponse<{ success: boolean; data: { id: string } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  /** A short-lived link to the page. A POST, and nothing lists these. */
  getProposalDocumentUrl: async (id: string) => {
    const response = await call(assetsEndpoints.proposalDocumentUrl, { id }, { body: {} }) as ApiResponse<{ success: boolean; data: { url: string; mimeType: string | null } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  // ============================================
  // CONTRACTS — read one, then propose, then apply
  // ============================================

  /** Text → fields. Decides nothing; the browser has no reader of its own. */
  readContract: async (text: string) => {
    const response = await call(assetsEndpoints.contractRead, undefined, { body: { text } }) as ApiResponse<{ success: boolean; data: ContractReading }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  /**
   * What accepting it would do.
   *
   * ⚠️ A POST, not a GET, because it carries a plate, a VIN and a person's id —
   * and this gateway logs URLs. The steps come back computed on the SERVER from
   * the kind and from what the member actually holds; nothing here names the
   * record to retire, and nothing here could.
   */
  previewContract: async (input: ContractProposalInput) => {
    const response = await call(assetsEndpoints.contractPreview, undefined, { body: input }) as ApiResponse<{ success: boolean; data: ContractPreview }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  /** Do it — all of it, or none of it. The server recomputes the plan first. */
  applyContract: async (input: ContractProposalInput) => {
    const response = await call(assetsEndpoints.contractApply, undefined, { body: input }) as ApiResponse<{
      success: boolean;
      data: { assetId: string; name: string; replaced: string[]; retired: boolean; startClamped: boolean };
    }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  // ============================================
  // EXPENSES — a member spends, the office accepts
  // ============================================

  getPendingExpenses: async () => {
    const response = await call(assetsEndpoints.pendingExpenses) as ApiResponse<{ success: boolean; data: { entries: PendingExpense[]; totalCents: number } }>;
    if (response.error) throw apiError(response);
    return response.data?.data ?? { entries: [], totalCents: 0 };
  },

  reviewExpense: async (entryId: string, decision: 'accept' | 'reject', note?: string) => {
    const response = await call(assetsEndpoints.reviewExpense, { entryId }, { body: { decision, note } }) as ApiResponse<{ success: boolean; data: { id: string; status: AssetExpenseStatus } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  /**
   * A short-lived link to one receipt.
   *
   * ⚠️ A POST, and nothing lists these. A URL handed out in bulk outlives the
   * reason it was issued; minting one per request keeps looking at somebody's
   * spending an act rather than a side effect of opening a page.
   */
  getReceiptUrl: async (entryId: string) => {
    const response = await call(assetsEndpoints.receiptUrl, { entryId }, { body: {} }) as ApiResponse<{ success: boolean; data: { url: string; mimeType: string | null } }>;
    if (response.error) throw apiError(response);
    return response.data?.data;
  },

  // scope 'all' includes work still open — the record page needs it, or a
  // technician cannot tell that a job is already raised.
  getAssetHistory: async (assetId: string, scope: 'done' | 'all' = 'all') => {
    const response = await call(assetsEndpoints.history, { id: assetId }, { query: { scope } }) as ApiResponse<{ success: boolean; data: MaintenanceHistoryItem[] }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data || [];
  },
};
