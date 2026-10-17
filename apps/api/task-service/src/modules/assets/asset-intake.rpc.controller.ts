import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AssetContractService } from './asset-contract.service';
import { AssetProposalService } from './asset-proposal.service';
import { ProposalReviewService } from './proposal-review.service';

/** Assets over RPC: contracts read into a record, and pages members send in. */
@Controller()
export class AssetIntakeRpcController {
  constructor(
    private readonly contracts: AssetContractService,
    private readonly proposals: AssetProposalService,
    private readonly proposalReview: ProposalReviewService,
  ) {}

  // ============================================
  // CONTRACTS — read one, then propose, then apply
  // ============================================

  @MessagePattern({ cmd: 'asset_contract_read' })
  async contractRead(@Payload() data: any) {
    return this.contracts.read(data);
  }

  @MessagePattern({ cmd: 'asset_contract_preview' })
  async contractPreview(@Payload() data: any) {
    return this.contracts.preview(data);
  }

  /*
    A write, straight to the service like the handover — one person pressing one
    button and watching for the result. It is a transaction either way; a round
    trip through Redis would only add latency to a screen somebody is looking at.
  */
  @MessagePattern({ cmd: 'asset_contract_apply' })
  async contractApply(@Payload() data: any) {
    return this.contracts.apply(data);
  }

  // ============================================
  // PROPOSALS — a member sends a page, the office decides
  // ============================================

  @MessagePattern({ cmd: 'asset_proposal_presign' })
  async proposalPresign(@Payload() data: any) {
    return this.proposals.presign(data);
  }

  @MessagePattern({ cmd: 'asset_proposal_raise' })
  async proposalRaise(@Payload() data: any) {
    return this.proposals.raise(data);
  }

  @MessagePattern({ cmd: 'asset_proposal_mine' })
  async proposalMine(@Payload() data: any) {
    return this.proposals.mine(data);
  }

  @MessagePattern({ cmd: 'asset_proposal_pending' })
  async proposalPending(@Payload() data: any) {
    return this.proposalReview.pending(data);
  }

  @MessagePattern({ cmd: 'asset_proposal_accept' })
  async proposalAccept(@Payload() data: any) {
    return this.proposalReview.accept(data);
  }

  @MessagePattern({ cmd: 'asset_proposal_reject' })
  async proposalReject(@Payload() data: any) {
    return this.proposalReview.reject(data);
  }

  @MessagePattern({ cmd: 'asset_proposal_withdraw' })
  async proposalWithdraw(@Payload() data: any) {
    return this.proposals.withdraw(data);
  }

  @MessagePattern({ cmd: 'asset_proposal_document_url' })
  async proposalDocumentUrl(@Payload() data: any) {
    return this.proposalReview.documentUrl(data);
  }
}
