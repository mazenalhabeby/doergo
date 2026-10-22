import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetsProcessor } from './assets.processor';
import { AssetCoreModule } from './core/asset-core.module';
import { AssetCustodyModule } from './custody/asset-custody.module';
import { AssetExpensesModule } from './expenses/asset-expenses.module';
import { AssetLogbookModule } from './logbook/asset-logbook.module';
import { AssetProposalsModule } from './proposals/asset-proposals.module';
import { AssetRegisterModule } from './register/asset-register.module';

/**
 * Equipment. Each part is its own module (code-structure-fix 4.4): core · custody · expenses · logbook ·
 * proposals · register. This module holds only the HTTP-facing controller and the queue processor, and
 * re-exports every part for the modules that use them (members).
 *
 * `NotificationRoutingService` needs no import — it is @Global, so the three consumers of "who is
 * responsible for this member" all inject it without wiring.
 */
const PARTS = [
  AssetCoreModule,
  AssetCustodyModule,
  AssetExpensesModule,
  AssetLogbookModule,
  AssetProposalsModule,
  AssetRegisterModule,
];

@Module({
  imports: PARTS,
  controllers: [AssetsController],
  providers: [AssetsProcessor],
  exports: PARTS,
})
export class AssetsModule {}
