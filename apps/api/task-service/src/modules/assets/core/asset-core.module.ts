import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { AssetAccessService } from './asset-access.service';
import { AssetResponsibleService } from './asset-responsible.service';
import { AssetNotifier } from './asset-notifier.service';
import { AssetAudienceService } from './asset-audience.service';
import { AssetActivityService } from './asset-activity.service';
import { AssetHoldersService } from './asset-holders.service';

/**
 * What every part of assets asks: may this caller act on this thing, who is responsible, who is told,
 * what happened to it, who holds it now.
 */
@Module({
  imports: [ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)])],
  providers: [
    AssetAccessService,
    AssetResponsibleService,
    AssetAudienceService,
    AssetNotifier,
    AssetActivityService,
    AssetHoldersService,
  ],
  exports: [AssetAccessService, AssetResponsibleService, AssetNotifier, AssetActivityService, AssetHoldersService],
})
export class AssetCoreModule {}
