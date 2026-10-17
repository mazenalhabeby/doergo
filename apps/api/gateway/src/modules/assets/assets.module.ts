import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { QUEUE_NAMES } from '@hbcfield/shared';
import { AssetsService } from './assets.service';
import { AssetsQueueService } from './assets.queue.service';
import { AssetsController } from './assets.controller';
import { AssetMineController } from './asset-mine.controller';
import { AssetExpensesController } from './asset-expenses.controller';
import { AssetIntakeController } from './asset-intake.controller';
import { AssetRecordsController } from './asset-records.controller';
import { AssetCustodyController } from './asset-custody.controller';
import { AssetCategoriesController, AssetTypesController } from './asset-categories.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.ASSETS }),
    BullBoardModule.forFeature({
      name: QUEUE_NAMES.ASSETS,
      adapter: BullMQAdapter,
    }),
  ],
  // ⚠️ ORDER MATTERS: every controller with STATIC paths (usage, orphans, mine,
  // expenses/*, proposals/*, contracts/*) comes before AssetsController's
  // `GET :id` and the `:id/...` controllers — Express matches in this order.
  controllers: [
    AssetMineController,
    AssetExpensesController,
    AssetIntakeController,
    AssetsController,
    AssetRecordsController,
    AssetCustodyController,
    AssetCategoriesController,
    AssetTypesController,
  ],
  providers: [AssetsService, AssetsQueueService],
})
export class AssetsModule {}
