import { Module } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { AssetAccessService } from './asset-access.service';
import { AssetCatalogService } from './asset-catalog.service';
import { AssetRowsService } from './asset-rows.service';
import { AssetLedgerService } from './asset-ledger.service';
import { AssetActivityService } from './asset-activity.service';
import { AssetUsageService } from './asset-usage.service';
import { AssetHoldersService } from './asset-holders.service';
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
];

@Module({
  controllers: [AssetsController],
  providers: [...SERVICES, AssetsProcessor],
  exports: SERVICES,
})
export class AssetsModule {}
