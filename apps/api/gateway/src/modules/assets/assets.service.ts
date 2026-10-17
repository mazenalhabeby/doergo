import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, BaseGatewayService } from '@hbcfield/shared';
import {
  pattern,
  addAssetActivity,
  addAssetMoney,
  addAssetRow,
  assetBillingUsage,
  assetContractApply,
  assetContractPreview,
  assetContractRead,
  assetCustodyForMember,
  assetCustodyHandover,
  assetCustodyMine,
  assetCustodyTimeline,
  assetExpenseMine,
  assetExpensePending,
  assetExpensePresign,
  assetExpenseRead,
  assetExpenseReceiptUrl,
  assetExpenseReview,
  assetExpenseSubmit,
  assetLogCreate,
  assetLogDueMine,
  assetLogList,
  assetLogMine,
  assetLogPresign,
  assetLogRemove,
  assetLogSummary,
  assetProposalAccept,
  assetProposalDocumentUrl,
  assetProposalMine,
  assetProposalPending,
  assetProposalPresign,
  assetProposalRaise,
  assetProposalReject,
  assetProposalWithdraw,
  findAllAssetCategories,
  findAllAssets,
  findAsset,
  findTypesByCategory,
  getAssetMaintenanceHistory,
  listAssetActivities,
  listAssetMoney,
  listAssetRows,
  listOrphanAssets,
  removeAssetMoney,
  removeAssetRow,
  updateAssetRow,
  type RpcRequest,
} from '@hbcfield/shared/microservices';

@Injectable()
export class AssetsService extends BaseGatewayService {
  constructor(@Inject(SERVICE_NAMES.TASK) taskClient: ClientProxy) {
    super(taskClient, AssetsService.name);
  }

  // Categories
  async findAllCategories(data: RpcRequest<typeof findAllAssetCategories>) {
    return this.send(pattern(findAllAssetCategories), data);
  }

  // Types
  async findTypesByCategory(data: RpcRequest<typeof findTypesByCategory>) {
    return this.send(pattern(findTypesByCategory), data);
  }

  // Assets
  async findAll(data: RpcRequest<typeof findAllAssets>) {
    return this.send(pattern(findAllAssets), data);
  }

  async findOne(data: RpcRequest<typeof findAsset>) {
    return this.send(pattern(findAsset), data);
  }

  async listOrphans(data: RpcRequest<typeof listOrphanAssets>) {
    return this.send(pattern(listOrphanAssets), data);
  }

  async billingUsage(data: RpcRequest<typeof assetBillingUsage>) {
    return this.send(pattern(assetBillingUsage), data);
  }

  async getMaintenanceHistory(data: RpcRequest<typeof getAssetMaintenanceHistory>) {
    return this.send(pattern(getAssetMaintenanceHistory), data);
  }

  async listActivities(data: RpcRequest<typeof listAssetActivities>) {
    return this.send(pattern(listAssetActivities), data);
  }

  // A note is small and wanted on screen immediately, so it goes straight to
  // the service rather than through the queue — the same call shape as a read.
  async addActivity(data: RpcRequest<typeof addAssetActivity>) {
    return this.send(pattern(addAssetActivity), data);
  }

  async listMoney(data: RpcRequest<typeof listAssetMoney>) {
    return this.send(pattern(listAssetMoney), data);
  }

  async addMoney(data: RpcRequest<typeof addAssetMoney>) {
    return this.send(pattern(addAssetMoney), data);
  }

  async removeMoney(data: RpcRequest<typeof removeAssetMoney>) {
    return this.send(pattern(removeAssetMoney), data);
  }

  // Custody — who held it, and when.
  async custodyTimeline(data: RpcRequest<typeof assetCustodyTimeline>) {
    return this.send(pattern(assetCustodyTimeline), data);
  }

  async custodyForMember(data: RpcRequest<typeof assetCustodyForMember>) {
    return this.send(pattern(assetCustodyForMember), data);
  }

  async custodyMine(data: RpcRequest<typeof assetCustodyMine>) {
    return this.send(pattern(assetCustodyMine), data);
  }

  /*
    A write that does NOT go through the queue, like a money entry and a note.
    The queue is there to make task creation exactly-once under a burst; a
    handover is one person pressing one button and watching for the result.
  */
  async custodyHandOver(data: RpcRequest<typeof assetCustodyHandover>) {
    return this.send(pattern(assetCustodyHandover), data);
  }

  // Expenses — a member spends, the office accepts.
  async expensePresign(data: RpcRequest<typeof assetExpensePresign>) {
    return this.send(pattern(assetExpensePresign), data);
  }

  /** Read a PDF receipt — the one file the phone's own reader cannot open. */
  async expenseRead(data: RpcRequest<typeof assetExpenseRead>) {
    return this.send(pattern(assetExpenseRead), data);
  }

  async expenseSubmit(data: RpcRequest<typeof assetExpenseSubmit>) {
    return this.send(pattern(assetExpenseSubmit), data);
  }

  async expenseMine(data: RpcRequest<typeof assetExpenseMine>) {
    return this.send(pattern(assetExpenseMine), data);
  }

  async expensePending(data: RpcRequest<typeof assetExpensePending>) {
    return this.send(pattern(assetExpensePending), data);
  }

  async expenseReview(data: RpcRequest<typeof assetExpenseReview>) {
    return this.send(pattern(assetExpenseReview), data);
  }

  async expenseReceiptUrl(data: RpcRequest<typeof assetExpenseReceiptUrl>) {
    return this.send(pattern(assetExpenseReceiptUrl), data);
  }

  // Proposals — a member sends a page, the office decides.
  async proposalPresign(data: RpcRequest<typeof assetProposalPresign>) {
    return this.send(pattern(assetProposalPresign), data);
  }

  async proposalRaise(data: RpcRequest<typeof assetProposalRaise>) {
    return this.send(pattern(assetProposalRaise), data);
  }

  async proposalMine(data: RpcRequest<typeof assetProposalMine>) {
    return this.send(pattern(assetProposalMine), data);
  }

  async proposalPending(data: RpcRequest<typeof assetProposalPending>) {
    return this.send(pattern(assetProposalPending), data);
  }

  async proposalAccept(data: RpcRequest<typeof assetProposalAccept>) {
    return this.send(pattern(assetProposalAccept), data);
  }

  async proposalReject(data: RpcRequest<typeof assetProposalReject>) {
    return this.send(pattern(assetProposalReject), data);
  }

  async proposalWithdraw(data: RpcRequest<typeof assetProposalWithdraw>) {
    return this.send(pattern(assetProposalWithdraw), data);
  }

  async proposalDocumentUrl(data: RpcRequest<typeof assetProposalDocumentUrl>) {
    return this.send(pattern(assetProposalDocumentUrl), data);
  }

  // Contracts — read, then propose, then apply.
  async contractRead(data: RpcRequest<typeof assetContractRead>) {
    return this.send(pattern(assetContractRead), data);
  }

  async contractPreview(data: RpcRequest<typeof assetContractPreview>) {
    return this.send(pattern(assetContractPreview), data);
  }

  async contractApply(data: RpcRequest<typeof assetContractApply>) {
    return this.send(pattern(assetContractApply), data);
  }

  async listRows(data: RpcRequest<typeof listAssetRows>) {
    return this.send(pattern(listAssetRows), data);
  }

  async addRow(data: RpcRequest<typeof addAssetRow>) {
    return this.send(pattern(addAssetRow), data);
  }

  async updateRow(data: RpcRequest<typeof updateAssetRow>) {
    return this.send(pattern(updateAssetRow), data);
  }

  async removeRow(data: RpcRequest<typeof removeAssetRow>) {
    return this.send(pattern(removeAssetRow), data);
  }

  // Logbook
  async logPresign(data: RpcRequest<typeof assetLogPresign>) {
    return this.send(pattern(assetLogPresign), data);
  }

  async logCreate(data: RpcRequest<typeof assetLogCreate>) {
    return this.send(pattern(assetLogCreate), data);
  }

  async logList(data: RpcRequest<typeof assetLogList>) {
    return this.send(pattern(assetLogList), data);
  }

  async logSummary(data: RpcRequest<typeof assetLogSummary>) {
    return this.send(pattern(assetLogSummary), data);
  }

  async logMine(data: RpcRequest<typeof assetLogMine>) {
    return this.send(pattern(assetLogMine), data);
  }

  async logDueMine(data: RpcRequest<typeof assetLogDueMine>) {
    return this.send(pattern(assetLogDueMine), data);
  }

  async logRemove(data: RpcRequest<typeof assetLogRemove>) {
    return this.send(pattern(assetLogRemove), data);
  }
}
