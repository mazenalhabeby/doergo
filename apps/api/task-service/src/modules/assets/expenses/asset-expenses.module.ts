import { Module } from '@nestjs/common';
import { AssetCoreModule } from '../core/asset-core.module';
import { AssetCustodyModule } from '../custody/asset-custody.module';
import { AssetExpenseService } from './asset-expense.service';
import { AssetExpenseReviewService } from './asset-expense-review.service';
import { AssetExpenseGateService } from './asset-expense-gate.service';

/**
 * What a member spent on a thing, read off a photographed slip, and the office's review of it.
 */
@Module({
  imports: [AssetCoreModule, AssetCustodyModule],
  providers: [AssetExpenseGateService, AssetExpenseService, AssetExpenseReviewService],
  exports: [AssetExpenseService, AssetExpenseReviewService],
})
export class AssetExpensesModule {}
