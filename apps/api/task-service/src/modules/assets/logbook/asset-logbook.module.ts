import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { Module } from '@nestjs/common';
import { AssetCoreModule } from '../core/asset-core.module';
import { AssetCustodyModule } from '../custody/asset-custody.module';
import { AssetExpensesModule } from '../expenses/asset-expenses.module';
import { AssetLogService } from './asset-log.service';
import { AssetLogReadService } from './asset-log-read.service';
import { AssetLogReminderService } from './asset-log-reminder.service';
import { AssetLedgerService } from './asset-ledger.service';
import { AssetRowsService } from './asset-rows.service';
import { AssetLogRpcController } from './asset-log.rpc.controller';
import { AssetMoneyRpcController } from './asset-money.rpc.controller';

/**
 * What gets done to a thing and when it is due again, its money ledger and its tables.
 */
@Module({
  imports: [
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
    AssetCoreModule,
    AssetCustodyModule,
    AssetExpensesModule,
  ],
  controllers: [AssetLogRpcController, AssetMoneyRpcController],
  providers: [AssetLogService, AssetLogReadService, AssetLogReminderService, AssetLedgerService, AssetRowsService],
  exports: [AssetLogService, AssetLogReadService, AssetLogReminderService, AssetLedgerService, AssetRowsService],
})
export class AssetLogbookModule {}
