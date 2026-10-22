import { ClientsModule } from '@nestjs/microservices';
import { SERVICE_NAMES, createClientOptions } from '@hbcfield/shared';
import { Module } from '@nestjs/common';
import { AssetCoreModule } from '../core/asset-core.module';
import { AssetCustodyModule } from '../custody/asset-custody.module';
import { AssetContractService } from './asset-contract.service';
import { AssetProposalService } from './asset-proposal.service';
import { ProposalReviewService } from './proposal-review.service';
import { AssetIntakeRpcController } from './asset-intake.rpc.controller';

/**
 * A contract read into a record, a handover and a retirement; a member sends a page in and somebody
 * responsible decides.
 */
@Module({
  imports: [
    ClientsModule.registerAsync([createClientOptions(SERVICE_NAMES.NOTIFICATION)]),
    AssetCoreModule,
    AssetCustodyModule,
  ],
  controllers: [AssetIntakeRpcController],
  providers: [AssetContractService, AssetProposalService, ProposalReviewService],
  exports: [AssetContractService, AssetProposalService, ProposalReviewService],
})
export class AssetProposalsModule {}
