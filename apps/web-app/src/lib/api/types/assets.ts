import {
  type AssetStatus,
  type AssetMoneyEntry,
  type CustodyHolderRef,
  type ContractFields,
} from './asset-status'
import { type AssetHolderInput } from './asset-proposal'
export {
  type AssetProposal,
  type PendingExpense,
  type AssetActivity,
  type CreateAssetCategoryInput,
  type UpdateAssetCategoryInput,
  type UpdateAssetInput,
  type AssetUsage,
  type OrphanAsset,
  type AssetsQueryParams,
} from './asset-proposal'
export {
  type AssetStatus,
  type AssetMoneyEntry,
  type CustodyHolderRef,
  type ContractFields,
  type AssetCategory,
  type Asset,
  type MaintenanceHistoryItem,
  type AssetListRow,
  type AssetExpenseStatus,
  type AssetLogEntry,
  type AssetLogPage,
  type AssetLogDue,
  type AssetLogSummary,
  type CreateAssetLogInput,
  type AssetMoneySummary,
  type CustodyPeriodDto,
  type CustodyTimeline,
  type ContractReading,
  type ContractStep,
  type ContractPreview,
  type ContractProposalInput,
} from './asset-status'

export interface CreateAssetInput {
  name: string;
  serialNumber?: string;
  model?: string;
  manufacturer?: string;
  status?: AssetStatus;
  installDate?: string;
  warrantyExpiry?: string;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  notes?: string;
  categoryId?: string;
  typeId?: string;
  /** Member who holds this (clears any client). */
  holderUserId?: string | null;
  /** Client who holds this (clears any member). */
  customerId?: string | null;
  /** Values for the fields this record's kind asks for. */
  details?: { label: string; value: string }[];
  /** Who holds it — one, or several when the type allows it. */
  holders?: AssetHolderInput[];
  /** The workspace, read by the module gate — an asset itself inherits its kind's. */
  spaceId?: string
}
