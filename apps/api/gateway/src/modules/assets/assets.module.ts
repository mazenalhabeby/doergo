import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { SERVICE_NAMES, createClientOptions, QUEUE_NAMES } from '@doergo/shared';
import { AssetsService } from './assets.service';
import { AssetsQueueService } from './assets.queue.service';
import { AssetsController } from './assets.controller';
import { AssetCategoriesController, AssetTypesController } from './asset-categories.controller';

@Module({
  imports: [
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.TASK)]),
    BullModule.registerQueue({ name: QUEUE_NAMES.ASSETS }),
    BullBoardModule.forFeature({
      name: QUEUE_NAMES.ASSETS,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [AssetsController, AssetCategoriesController, AssetTypesController],
  providers: [AssetsService, AssetsQueueService],
})
export class AssetsModule {}
