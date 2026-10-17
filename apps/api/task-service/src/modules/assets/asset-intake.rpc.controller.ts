import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  pattern,
  assetContractApply,
  assetContractPreview,
  assetContractRead,
  assetProposalAccept,
  assetProposalDocumentUrl,
  assetProposalMine,
  assetProposalPending,
  assetProposalPresign,
  assetProposalRaise,
  assetProposalReject,
  assetProposalWithdraw,
  type RpcRequest,
} from '@hbcfield/shared/microservices';
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

  @MessagePattern(pattern(assetContractRead))
  async contractRead(@Payload() data: RpcRequest<typeof assetContractRead>) {
    return this.contracts.read(data);
  }

  @MessagePattern(pattern(assetContractPreview))
  async contractPreview(@Payload() data: RpcRequest<typeof assetContractPreview>) {
    return this.contracts.preview(data);
  }

  /*
    A write, straight to the service like the handover — one person pressing one
    button and watching for the result. It is a transaction either way; a round
    trip through Redis would only add latency to a screen somebody is looking at.
  */
  @MessagePattern(pattern(assetContractApply))
  async contractApply(@Payload() data: RpcRequest<typeof assetContractApply>) {
    return this.contracts.apply(data);
  }

  // ============================================
  // PROPOSALS — a member sends a page, the office decides
  // ============================================

  @MessagePattern(pattern(assetProposalPresign))
  async proposalPresign(@Payload() data: RpcRequest<typeof assetProposalPresign>) {
    return this.proposals.presign(data);
  }

  @MessagePattern(pattern(assetProposalRaise))
  async proposalRaise(@Payload() data: RpcRequest<typeof assetProposalRaise>) {
    return this.proposals.raise(data);
  }

  @MessagePattern(pattern(assetProposalMine))
  async proposalMine(@Payload() data: RpcRequest<typeof assetProposalMine>) {
    return this.proposals.mine(data);
  }

  @MessagePattern(pattern(assetProposalPending))
  async proposalPending(@Payload() data: RpcRequest<typeof assetProposalPending>) {
    return this.proposalReview.pending(data);
  }

  @MessagePattern(pattern(assetProposalAccept))
  async proposalAccept(@Payload() data: RpcRequest<typeof assetProposalAccept>) {
    return this.proposalReview.accept(data);
  }

  @MessagePattern(pattern(assetProposalReject))
  async proposalReject(@Payload() data: RpcRequest<typeof assetProposalReject>) {
    return this.proposalReview.reject(data);
  }

  @MessagePattern(pattern(assetProposalWithdraw))
  async proposalWithdraw(@Payload() data: RpcRequest<typeof assetProposalWithdraw>) {
    return this.proposals.withdraw(data);
  }

  @MessagePattern(pattern(assetProposalDocumentUrl))
  async proposalDocumentUrl(@Payload() data: RpcRequest<typeof assetProposalDocumentUrl>) {
    return this.proposalReview.documentUrl(data);
  }
}
