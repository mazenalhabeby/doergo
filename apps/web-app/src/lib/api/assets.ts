import { call, type ApiResponse } from '../http-client';
import { apiError } from '../server-error';
import type {
  Asset,
  AssetActivity,
  AssetCategory,
  AssetExpenseStatus,
  AssetListRow,
  AssetLogEntry,
  AssetLogPage,
  AssetLogSummary,
  AssetMoneyEntry,
  AssetMoneySummary,
  AssetProposal,
  AssetUsage,
  AssetsQueryParams,
  ContractFields,
  ContractPreview,
  ContractProposalInput,
  ContractReading,
  CreateAssetCategoryInput,
  CreateAssetInput,
  CreateAssetLogInput,
  CustodyPeriodDto,
  CustodyTimeline,
  MaintenanceHistoryItem,
  OrphanAsset,
  PendingExpense,
  UpdateAssetCategoryInput,
  UpdateAssetInput
} from './types/assets';
import { assetCategoriesEndpoints, assetsEndpoints } from '@hbcfield/shared/client';
import { assetRecordsApi } from './assets-records';
import { assetReviewApi } from './assets-review';

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
    const response = await call(
      assetCategoriesEndpoints.list,
      undefined,
      { query: { spaceId: spaceId || undefined } }) as ApiResponse<{ success: boolean; data: AssetCategory[] }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data || [];
  },

  // Create a new category
  createCategory: async (input: CreateAssetCategoryInput) => {
    const response = await call(
      assetCategoriesEndpoints.create,
      undefined,
      { body: input }) as ApiResponse<{ success: boolean; data: AssetCategory }>;

    if (response.error) {
      throw apiError(response);
    }

    return response.data?.data;
  },

  // Update a category
  updateCategory: async (id: string, input: UpdateAssetCategoryInput) => {
    const response = await call(
      assetCategoriesEndpoints.update,
      { id },
      { body: input }) as ApiResponse<{ success: boolean; data: AssetCategory }>;

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
  ...assetRecordsApi,
  ...assetReviewApi,
};
