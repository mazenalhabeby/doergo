import { Module } from '@nestjs/common';
import { AssetCoreModule } from '../core/asset-core.module';
import { AssetCustodyModule } from '../custody/asset-custody.module';
import { AssetLogbookModule } from '../logbook/asset-logbook.module';
import { AssetsService } from './assets.service';
import { AssetCreateService } from './asset-create.service';
import { AssetUpdateService } from './asset-update.service';
import { AssetCatalogService } from './asset-catalog.service';
import { AssetTypesService } from './asset-types.service';
import { AssetUsageService } from './asset-usage.service';

/**
 * The register: the records, their kinds and types, creating and editing them, how many are billable.
 */
@Module({
  imports: [AssetCoreModule, AssetCustodyModule, AssetLogbookModule],
  providers: [
    AssetsService,
    AssetCreateService,
    AssetUpdateService,
    AssetCatalogService,
    AssetTypesService,
    AssetUsageService,
  ],
  exports: [
    AssetsService,
    AssetCreateService,
    AssetUpdateService,
    AssetCatalogService,
    AssetTypesService,
    AssetUsageService,
  ],
})
export class AssetRegisterModule {}
