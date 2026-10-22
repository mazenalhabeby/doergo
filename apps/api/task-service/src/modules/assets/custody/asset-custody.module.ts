import { Module } from '@nestjs/common';
import { AssetCoreModule } from '../core/asset-core.module';
import { AssetCustodyService } from './asset-custody.service';
import { CustodyReadService } from './custody-read.service';

/**
 * Who held a thing and when — custody as periods, and reading them.
 */
@Module({
  imports: [AssetCoreModule],
  providers: [AssetCustodyService, CustodyReadService],
  exports: [AssetCustodyService, CustodyReadService],
})
export class AssetCustodyModule {}
