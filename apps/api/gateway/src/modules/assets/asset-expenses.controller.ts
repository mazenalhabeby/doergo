import { Controller, Get, Post, Body, Param, Query, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { RequirePermissionInSpace, DenyExternal } from '../../common/decorators';
import { AssetsService } from './assets.service';
import { AssetsQueueService } from './assets.queue.service';
import { ReceiptPresignDto, ReadReceiptDto, SubmitExpenseDto } from './dto';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { assetActor } from './asset-actor';

import type { AuthedRequest } from '../../common/request.types';
/** /assets — expenses: filing one with its slip, the office's queue and decision, a receipt link. */
@ApiTags('assets')
@ApiBearerAuth()
@RequireModule('assets')
@Controller('assets')
export class AssetExpensesController {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly assetsQueueService: AssetsQueueService,
  ) {}

  /*
    The office's queue: everything waiting on a decision — of the records the
    caller may READ, narrowed in the service by each record's workspace. The
    same reach as each record's own Money tab, which lists these entries too.
  */
  @Get('expenses/pending')
  @RequirePermissionInSpace('canViewAssets')
  @ApiOperation({ summary: 'Expenses waiting for a decision' })
  async pendingExpenses(@Query('limit') limit: number, @Request() req: AuthedRequest) {
    return this.assetsService.expensePending({
      limit,
      ...assetActor(req),
    });
  }

  /*
    Accept an expense, or refuse it with a reason.

    A WRITE against the organization's books, so it asks the write permission —
    in the workspace of the record the slip was filed against, decided in the
    service, which answers another workspace's slip as "not waiting".
  */
  @Post('expenses/:entryId/review')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Accept or refuse a submitted expense' })
  async reviewExpense(
    @Param('entryId') entryId: string,
    @Body() body: { decision?: 'accept' | 'reject'; note?: string },
    @Request() req: AuthedRequest,
  ) {
    return this.assetsService.expenseReview({
      entryId,
      decision: body?.decision === 'reject' ? 'reject' : 'accept',
      note: body?.note,
      ...assetActor(req),
    });
  }

  /*
    A link to the slip, minted here and short-lived.

    ⚠️ A POST, and no list anywhere returns a receipt URL. A URL handed out in
    bulk outlives the reason it was issued; minting one per request keeps
    looking at somebody's spending an act rather than a side effect of opening
    a page. Same rule as a member document's download link.

    The author, or whoever may read that record's money (in its workspace).
    `@DenyExternal`: a receipt is a staff member's spending, filed through
    custody — the organization's own business.
  */
  @Post('expenses/:entryId/receipt-url')
  @DenyExternal()
  @ApiOperation({ summary: 'A short-lived link to one receipt' })
  async receiptUrl(@Param('entryId') entryId: string, @Request() req: AuthedRequest) {
    return this.assetsService.expenseReceiptUrl({
      entryId,
      ...assetActor(req),
    });
  }

  /*
    A place to put the photograph. Bytes go phone → S3 directly; nothing large
    passes through here.

    No permission decorator, and that is the point: what a member may file
    against is what they HELD ON THAT DATE, which is a fact about custody and
    not about a role — or, for the office, `canLogAssets` in the record's
    workspace. The service checks both.

    `@DenyExternal` on all three expense routes: filing by custody is the
    organization's system for its staff. An external member with
    `canLogAssets` logs through the logbook below.
  */
  @Post(':id/expenses/presign')
  @DenyExternal()
  @ApiOperation({ summary: 'Upload URL for a receipt' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async presignReceipt(@Param('id') id: string, @Body() dto: ReceiptPresignDto, @Request() req: AuthedRequest) {
    return this.assetsService.expensePresign({
      id,
      ...dto,
      ...assetActor(req),
    });
  }

  /**
   * Read a PDF receipt before filing it.
   *
   * ⚠️ Deliberately NOT gated on a permission, exactly like the presign above.
   * What a member may read here is the file THEY just uploaded against
   * something they HELD on that date — a fact about custody, which the service
   * checks. `canManageAssets` here would lock every driver out of the one
   * screen built for them.
   *
   * Images are not read here: the phone reads those on-device, better and for
   * free. This exists for the file a phone cannot open at all.
   */
  @Post(':id/expenses/read')
  @DenyExternal()
  @ApiOperation({ summary: 'Read a PDF receipt I just uploaded' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async readReceipt(@Param('id') id: string, @Body() dto: ReadReceiptDto, @Request() req: AuthedRequest) {
    return this.assetsService.expenseRead({
      id,
      ...dto,
      ...assetActor(req),
    });
  }

  /** File it. Counted only once somebody who manages that record's workspace accepts it. */
  @Post(':id/expenses')
  @DenyExternal()
  @ApiOperation({ summary: 'File an expense against something I hold' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async submitExpense(@Param('id') id: string, @Body() dto: SubmitExpenseDto, @Request() req: AuthedRequest) {
    return this.assetsService.expenseSubmit({
      id,
      ...dto,
      ...assetActor(req),
    });
  }
}
