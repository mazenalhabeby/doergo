import { Module } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { AssetAccessService } from './asset-access.service';
import { AssetCatalogService } from './asset-catalog.service';
import { AssetRowsService } from './asset-rows.service';
import { AssetLedgerService } from './asset-ledger.service';
import { AssetActivityService } from './asset-activity.service';
import { AssetsController } from './assets.controller';
import { AssetsProcessor } from './assets.processor';

/**
 * One 1,500-line service became six, split by subject rather than by layer:
 * the rules everything shares, the kinds, the records, their tables, their
 * money, and what happened to them. Each is injected where it is needed, so a
 * dependency is visible in a constructor rather than implied by a file.
 */
const SERVICES = [
  AssetAccessService,
  AssetCatalogService,
  AssetsService,
  AssetRowsService,
  AssetLedgerService,
  AssetActivityService,
];

@Module({
  controllers: [AssetsController],
  providers: [...SERVICES, AssetsProcessor],
  exports: SERVICES,
})
export class AssetsModule {}
