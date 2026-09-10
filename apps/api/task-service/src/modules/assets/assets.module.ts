import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { AssetsService } from './assets.service';
import { AssetAccessService } from './asset-access.service';
import { AssetCatalogService } from './asset-catalog.service';
import { AssetRowsService } from './asset-rows.service';
import { AssetLedgerService } from './asset-ledger.service';
import { AssetActivityService } from './asset-activity.service';
import { AssetUsageService } from './asset-usage.service';
import { AssetHoldersService } from './asset-holders.service';
import { AssetCustodyService } from './asset-custody.service';
import { AssetExpenseService } from './asset-expense.service';
import { AssetContractService } from './asset-contract.service';
import { AssetProposalService } from './asset-proposal.service';
import { AssetsController } from './assets.controller';
import { AssetsProcessor } from './assets.processor';

/**
 * One 1,500-line service became several, split by subject rather than by layer:
 * the rules everything shares, the kinds, the records, their tables, their
 * money, what happened to them, and how many of them are billable. Each is
 * injected where it is needed, so a dependency is visible in a constructor
 * rather than implied by a file.
 */
const SERVICES = [
  AssetAccessService,
  AssetCatalogService,
  AssetsService,
  AssetRowsService,
  AssetLedgerService,
  AssetActivityService,
  AssetUsageService,
  AssetHoldersService,
  // Who held it and when, and what they spent on it while they did.
  AssetCustodyService,
  AssetExpenseService,
  // A contract read into a record, a handover and a retirement.
  AssetContractService,
  // A member sends a page in; somebody responsible decides.
  AssetProposalService,
];

@Module({
  /*
    A proposal has to reach somebody, so this module now talks to the
    notification service. `NotificationRoutingService` needs no import — it is
    @Global, so the three consumers of "who is responsible for this member" all
    inject it without wiring.
  */
  imports: [ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  controllers: [AssetsController],
  providers: [...SERVICES, AssetsProcessor],
  exports: SERVICES,
})
export class AssetsModule {}
