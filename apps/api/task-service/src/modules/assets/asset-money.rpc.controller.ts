import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  pattern,
  addAssetMoney,
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
  listAssetMoney,
  removeAssetMoney,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
import { AssetLedgerService } from './asset-ledger.service';
import { AssetCustodyService } from './asset-custody.service';
import { AssetExpenseService } from './asset-expense.service';
import { AssetLogService } from './asset-log.service';
import { CustodyReadService } from './custody-read.service';
import { AssetExpenseReviewService } from './asset-expense-review.service';

/** Assets over RPC: money, custody and expenses. */
@Controller()
export class AssetMoneyRpcController {
  constructor(
    private readonly ledger: AssetLedgerService,
    private readonly custody: AssetCustodyService,
    private readonly custodyRead: CustodyReadService,
    private readonly expenses: AssetExpenseService,
    private readonly expenseReviews: AssetExpenseReviewService,
    private readonly logs: AssetLogService,
  ) {}

  @MessagePattern(pattern(listAssetMoney))
  async listMoney(@Payload() data: RpcRequest<typeof listAssetMoney>) {
    return this.ledger.listMoney(data);
  }

  @MessagePattern(pattern(addAssetMoney))
  async addMoney(@Payload() data: RpcRequest<typeof addAssetMoney>) {
    return this.ledger.addMoney(data);
  }

  @MessagePattern(pattern(removeAssetMoney))
  async removeMoney(@Payload() data: RpcRequest<typeof removeAssetMoney>) {
    return this.ledger.removeMoney(data);
  }

  // ============================================
  // CUSTODY — who held it, and when
  // ============================================

  @MessagePattern(pattern(assetCustodyTimeline))
  async custodyTimeline(@Payload() data: RpcRequest<typeof assetCustodyTimeline>) {
    return this.custodyRead.timeline(data);
  }

  /*
    A write, and it goes STRAIGHT to the service rather than through the queue —
    the same choice as a money entry or a note. The queue exists to make task
    creation exactly-once under a burst; a handover is one person pressing one
    button and waiting to see the result, and a round trip through Redis buys
    nothing but latency on a screen somebody is watching.
  */
  @MessagePattern(pattern(assetCustodyHandover))
  async handOver(@Payload() data: RpcRequest<typeof assetCustodyHandover>) {
    return this.custody.handOver(data);
  }

  @MessagePattern(pattern(assetCustodyForMember))
  async custodyForMember(@Payload() data: RpcRequest<typeof assetCustodyForMember>) {
    return this.custodyRead.forMember(data);
  }

  /** What the CALLER holds — the phone opens on this. */
  @MessagePattern(pattern(assetCustodyMine))
  async custodyMine(@Payload() data: RpcRequest<typeof assetCustodyMine>) {
    return this.custodyRead.mine(data);
  }

  // ============================================
  // EXPENSES — a member spends, the office accepts
  // ============================================

  @MessagePattern(pattern(assetExpensePresign))
  async expensePresign(@Payload() data: RpcRequest<typeof assetExpensePresign>) {
    return this.expenses.presignReceipt(data);
  }

  @MessagePattern(pattern(assetExpenseRead))
  async expenseRead(@Payload() data: RpcRequest<typeof assetExpenseRead>) {
    return this.expenses.readReceipt(data);
  }

  @MessagePattern(pattern(assetExpenseSubmit))
  async expenseSubmit(@Payload() data: RpcRequest<typeof assetExpenseSubmit>) {
    return this.expenses.submit(data);
  }

  @MessagePattern(pattern(assetExpenseMine))
  async expenseMine(@Payload() data: RpcRequest<typeof assetExpenseMine>) {
    return this.expenseReviews.mine(data);
  }

  @MessagePattern(pattern(assetExpensePending))
  async expensePending(@Payload() data: RpcRequest<typeof assetExpensePending>) {
    return this.expenseReviews.pending(data);
  }

  /*
    Through the logbook, which calls the same decision and then recomputes the
    asset: an accepted oil change resets a service interval, and a decision that
    skipped that would leave the due date a job behind.
  */
  @MessagePattern(pattern(assetExpenseReview))
  async expenseReview(@Payload() data: RpcRequest<typeof assetExpenseReview>) {
    return this.logs.review(data);
  }

  @MessagePattern(pattern(assetExpenseReceiptUrl))
  async expenseReceiptUrl(@Payload() data: RpcRequest<typeof assetExpenseReceiptUrl>) {
    return this.expenses.receiptUrl(data);
  }
}
