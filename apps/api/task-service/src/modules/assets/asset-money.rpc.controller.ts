import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
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

  @MessagePattern({ cmd: 'list_asset_money' })
  async listMoney(@Payload() data: any) {
    return this.ledger.listMoney(data);
  }

  @MessagePattern({ cmd: 'add_asset_money' })
  async addMoney(@Payload() data: any) {
    return this.ledger.addMoney(data);
  }

  @MessagePattern({ cmd: 'remove_asset_money' })
  async removeMoney(@Payload() data: any) {
    return this.ledger.removeMoney(data);
  }

  // ============================================
  // CUSTODY — who held it, and when
  // ============================================

  @MessagePattern({ cmd: 'asset_custody_timeline' })
  async custodyTimeline(@Payload() data: any) {
    return this.custodyRead.timeline(data);
  }

  /*
    A write, and it goes STRAIGHT to the service rather than through the queue —
    the same choice as a money entry or a note. The queue exists to make task
    creation exactly-once under a burst; a handover is one person pressing one
    button and waiting to see the result, and a round trip through Redis buys
    nothing but latency on a screen somebody is watching.
  */
  @MessagePattern({ cmd: 'asset_custody_handover' })
  async handOver(@Payload() data: any) {
    return this.custody.handOver(data);
  }

  @MessagePattern({ cmd: 'asset_custody_for_member' })
  async custodyForMember(@Payload() data: any) {
    return this.custodyRead.forMember(data);
  }

  /** What the CALLER holds — the phone opens on this. */
  @MessagePattern({ cmd: 'asset_custody_mine' })
  async custodyMine(@Payload() data: any) {
    return this.custodyRead.mine(data);
  }

  // ============================================
  // EXPENSES — a member spends, the office accepts
  // ============================================

  @MessagePattern({ cmd: 'asset_expense_presign' })
  async expensePresign(@Payload() data: any) {
    return this.expenses.presignReceipt(data);
  }

  @MessagePattern({ cmd: 'asset_expense_read' })
  async expenseRead(@Payload() data: any) {
    return this.expenses.readReceipt(data);
  }

  @MessagePattern({ cmd: 'asset_expense_submit' })
  async expenseSubmit(@Payload() data: any) {
    return this.expenses.submit(data);
  }

  @MessagePattern({ cmd: 'asset_expense_mine' })
  async expenseMine(@Payload() data: any) {
    return this.expenseReviews.mine(data);
  }

  @MessagePattern({ cmd: 'asset_expense_pending' })
  async expensePending(@Payload() data: any) {
    return this.expenseReviews.pending(data);
  }

  /*
    Through the logbook, which calls the same decision and then recomputes the
    asset: an accepted oil change resets a service interval, and a decision that
    skipped that would leave the due date a job behind.
  */
  @MessagePattern({ cmd: 'asset_expense_review' })
  async expenseReview(@Payload() data: any) {
    return this.logs.review(data);
  }

  @MessagePattern({ cmd: 'asset_expense_receipt_url' })
  async expenseReceiptUrl(@Payload() data: any) {
    return this.expenses.receiptUrl(data);
  }
}
