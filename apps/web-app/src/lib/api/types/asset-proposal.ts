import {
  type AssetStatus,
  type AssetMoneyEntry,
  type CustodyHolderRef,
  type ContractFields,
} from './asset-status'

// ============================================
// ASSET MANAGEMENT TYPES & API
// ============================================

/** A page a member sent in, waiting on somebody responsible. */
export interface AssetProposal {
  id: string;
  fields: ContractFields;
  signals?: string[];
  documentKind: 'asset-contract' | 'unknown';
  categoryId: string | null;
  raisedById: string;
  holderUserId: string | null;
  raisedBy?: CustodyHolderRef | null;
  holder?: CustodyHolderRef | null;
  hasDocument: boolean;
  fileName?: string | null;
  createdAt: string;
}

/** One expense waiting on a decision, in the office's queue. */
export interface PendingExpense extends AssetMoneyEntry {
  assetId: string;
  asset?: { id: string; name: string } | null;
  author?: CustodyHolderRef | null;
  createdAt: string;
}

export interface AssetActivity {
  id: string;
  type: string;
  body: string | null;
  authorId: string | null;
  author?: { id: string; firstName: string; lastName: string } | null;
  metadata?: unknown;
  createdAt: string;
}

export interface CreateAssetCategoryInput {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  /** The space this kind belongs to. */
  spaceId?: string;
  /** What this kind's records look like. */
  config?: unknown;
}

export interface UpdateAssetCategoryInput {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
}

/** One holder on an asset: a member OR a client, never both. */
export interface AssetHolderInput {
  userId?: string | null;
  customerId?: string | null;
}

export interface UpdateAssetInput {
  name?: string;
  /** null clears the fact — "" would be stored as a blank serial number. */
  serialNumber?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  status?: AssetStatus;
  /** YYYY-MM-DD, or null to clear. */
  installDate?: string | null;
  warrantyExpiry?: string | null;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  notes?: string | null;
  categoryId?: string | null;
  typeId?: string | null;
  /** Who holds it — one, or several when the type allows it. */
  holders?: AssetHolderInput[];
}

/** One counted module's numbers — the same shape for assets, clients and portals. */
export interface ModuleUsageCounts {
  total: number;
  /** Records in no space — billed by nobody. For assets, listed by `getOrphans`. */
  unassigned: number;
  /** spaceId → how many. */
  spaces: Record<string, number>;
}

/**
 * What each counted module has in it — see `assetsApi.getUsage`.
 *
 * The asset numbers are repeated at the top level because the orphan card and
 * the space header read them there; `modules` is the shape everything new
 * should use, keyed by the same module keys the pricing ladders are.
 */
export interface AssetUsage extends ModuleUsageCounts {
  modules?: Record<string, ModuleUsageCounts>;
}

/** An asset that belongs to no space — see `assetsApi.getOrphans`. */
export interface OrphanAsset {
  id: string;
  name: string;
  status: AssetStatus;
  serialNumber: string | null;
  createdAt: string;
  category: { id: string; name: string } | null;
  type: { id: string; name: string } | null;
  _count: { tasks: number };
}

export interface AssetsQueryParams {
  /** One workspace. The server intersects it with the caller's own. */
  spaceId?: string;
  categoryId?: string;
  typeId?: string;
  status?: AssetStatus;
  /** Leave RETIRED out. Text, as a query string carries it; ignored when `status` is set. */
  hideRetired?: 'true';
  search?: string;
  page?: number;
  limit?: number;
}
