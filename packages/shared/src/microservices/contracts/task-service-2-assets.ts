import { rpc } from '../contract';
import type { CustodyParty } from '../../assets/custody/periods';
import type { AssetActorMessage, ContractFieldsMessage } from './task-service-2-types';

/** task-service `assets` handlers — the request each one reads. */

export const findAllAssetCategories = rpc<{ spaceId?: string } & AssetActorMessage>('find_all_asset_categories');
export const findTypesByCategory = rpc<{ categoryId: string } & AssetActorMessage>('find_types_by_category');
export const findAllAssets = rpc<
  {
    page?: number;
    limit?: number;
    categoryId?: string;
    typeId?: string;
    status?: string;
    hideRetired?: string | boolean;
    search?: string;
    spaceId?: string;
  } & AssetActorMessage
>('find_all_assets');
export const findAssetSpace = rpc<{ id: string; organizationId: string }>('find_asset_space');
export const findAsset = rpc<{ id: string } & AssetActorMessage>('find_asset');
export const listOrphanAssets = rpc<{
  userId: string;
  userRole: string;
  organizationId: string;
  isExternal?: boolean;
  viewSpaceIds?: null | string[];
  logSpaceIds?: null | string[];
  manageSpaceIds?: null | string[];
  canManageAssets?: boolean;
}>('list_orphan_assets');
export const assetBillingUsage = rpc<AssetActorMessage>('asset_billing_usage');
export const getAssetMaintenanceHistory = rpc<
  { id: string; page?: number; limit?: number; scope?: 'done' | 'all' } & AssetActorMessage
>('get_asset_maintenance_history');
export const listAssetActivities = rpc<{ id: string } & AssetActorMessage>('list_asset_activities');
export const addAssetActivity = rpc<{ id: string; body: string } & AssetActorMessage>('add_asset_activity');
export const assetContractRead = rpc<{ text?: string } & AssetActorMessage>('asset_contract_read');
export const assetContractPreview = rpc<
  {
    categoryId: string;
    typeId?: string;
    holderUserId: string;
    fields: ContractFieldsMessage;
    retireReplaced?: boolean;
  } & AssetActorMessage
>('asset_contract_preview');
export const assetContractApply = rpc<
  {
    categoryId: string;
    typeId?: string;
    holderUserId: string;
    fields: ContractFieldsMessage;
    retireReplaced?: boolean;
  } & AssetActorMessage
>('asset_contract_apply');
export const assetProposalPresign = rpc<{ fileName: string; mimeType: string; userId: string; organizationId: string }>(
  'asset_proposal_presign',
);
export const assetProposalRaise = rpc<{
  fields: ContractFieldsMessage;
  signals?: string[];
  documentKind?: string;
  categoryId?: string;
  holderUserId?: string;
  fileKey?: string;
  fileName?: string;
  fileMime?: string;
  userId: string;
  userRole: string;
  organizationId: string;
  canManageAssets?: boolean;
  id?: string;
}>('asset_proposal_raise');
export const assetProposalMine = rpc<{ userId: string; organizationId: string }>('asset_proposal_mine');
export const assetProposalPending = rpc<AssetActorMessage & { spaceId?: string }>('asset_proposal_pending');
export const assetProposalAccept = rpc<
  {
    id: string;
    categoryId?: string;
    typeId?: string;
    fields?: ContractFieldsMessage;
    retireReplaced?: boolean;
  } & AssetActorMessage
>('asset_proposal_accept');
export const assetProposalReject = rpc<{ id: string; note?: string } & AssetActorMessage>('asset_proposal_reject');
export const assetProposalWithdraw = rpc<{ id: string; userId: string; organizationId: string }>(
  'asset_proposal_withdraw',
);
export const assetProposalDocumentUrl = rpc<{ id: string } & AssetActorMessage>('asset_proposal_document_url');
export const assetLogPresign = rpc<
  AssetActorMessage & { id: string; logType?: null | string; fileName: string; mimeType: string; occurredAt?: string }
>('asset_log_presign');
export const assetLogCreate = rpc<
  AssetActorMessage & {
    id: string;
    logType?: null | string;
    values?: unknown;
    note?: string;
    occurredAt?: string;
    receiptKey?: string;
    receiptName?: string;
    receiptMime?: string;
    entryId?: string;
  }
>('asset_log_create');
export const assetLogList = rpc<
  AssetActorMessage & {
    id: string;
    logType?: string;
    authorId?: string;
    status?: string;
    cursor?: string;
    limit?: number;
  }
>('asset_log_list');
export const assetLogSummary = rpc<AssetActorMessage & { id: string; from?: string; to?: string }>('asset_log_summary');
export const assetLogMine = rpc<{ userId: string; organizationId: string; assetId?: string; limit?: number }>(
  'asset_log_mine',
);
export const assetLogDueMine = rpc<{ userId: string; organizationId: string }>('asset_log_due_mine');
export const assetLogRemove = rpc<AssetActorMessage & { id: string; entryId: string }>('asset_log_remove');
export const listAssetRows = rpc<
  { id: string; list: string; search?: string; page?: number; limit?: number } & AssetActorMessage
>('list_asset_rows');
export const addAssetRow = rpc<{ id: string; list: string; values: unknown } & AssetActorMessage>('add_asset_row');
export const updateAssetRow = rpc<{ id: string; rowId: string; values: unknown } & AssetActorMessage>(
  'update_asset_row',
);
export const removeAssetRow = rpc<{ id: string; rowId: string } & AssetActorMessage>('remove_asset_row');
export const listAssetMoney = rpc<{ id: string; limit?: number } & AssetActorMessage>('list_asset_money');
export const addAssetMoney = rpc<
  { id: string; category: string; amountCents: number; note?: string; occurredAt?: string } & AssetActorMessage
>('add_asset_money');
export const removeAssetMoney = rpc<{ id: string; entryId: string } & AssetActorMessage>('remove_asset_money');
export const assetCustodyTimeline = rpc<{ id: string } & AssetActorMessage>('asset_custody_timeline');
export const assetCustodyHandover = rpc<
  { id: string; to?: CustodyParty[]; at?: string; reason?: string } & AssetActorMessage
>('asset_custody_handover');
export const assetCustodyForMember = rpc<{ memberId: string; open?: boolean } & AssetActorMessage>(
  'asset_custody_for_member',
);
export const assetCustodyMine = rpc<{ userId: string; organizationId: string }>('asset_custody_mine');
export const assetExpensePresign = rpc<
  { id: string; fileName: string; mimeType: string; occurredAt?: string } & AssetActorMessage
>('asset_expense_presign');
export const assetExpenseRead = rpc<{ id: string; fileKey: string; occurredAt?: string } & AssetActorMessage>(
  'asset_expense_read',
);
export const assetExpenseSubmit = rpc<
  {
    id: string;
    category: string;
    amountCents: number;
    note?: string;
    occurredAt?: string;
    receiptKey?: string;
    receiptName?: string;
    receiptMime?: string;
    entryId?: string;
  } & AssetActorMessage
>('asset_expense_submit');
export const assetExpenseMine = rpc<{ userId: string; organizationId: string; limit?: number }>('asset_expense_mine');
export const assetExpensePending = rpc<{ limit?: number } & AssetActorMessage>('asset_expense_pending');
export const assetExpenseReview = rpc<
  AssetActorMessage & { entryId: string; decision: 'accept' | 'reject'; note?: string }
>('asset_expense_review');
export const assetExpenseReceiptUrl = rpc<{ entryId: string } & AssetActorMessage>('asset_expense_receipt_url');
