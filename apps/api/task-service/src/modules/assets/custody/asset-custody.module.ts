import { Module } from '@nestjs/common';
import { AssetCoreModule } from '../core/asset-core.module';
import { AssetCustodyService } from './asset-custody.service';
import { CustodyReadService } from './custody-read.service';
import { CustodyWriterService } from './custody-writer.service';

/**
 * Who held a thing and when — custody as periods, and reading them.
 */
@Module({
  imports: [AssetCoreModule],
  // CustodyWriterService is deliberately NOT exported — AssetCustodyService.apply is the one door.
  providers: [CustodyWriterService, AssetCustodyService, CustodyReadService],
  exports: [AssetCustodyService, CustodyReadService],
})
export class AssetCustodyModule {}
