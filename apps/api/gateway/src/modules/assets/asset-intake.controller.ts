import { Controller, Get, Post, Body, Param, Query, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { RequirePermissionInSpace, DenyExternal } from '../../common/decorators';
import { AssetsService } from './assets.service';
import { AssetsQueueService } from './assets.queue.service';
import {
  ContractProposalDto,
  ReadContractDto,
  RaiseProposalDto,
  AcceptProposalDto,
  ProposalPresignDto,
  PendingProposalsQueryDto,
} from './dto';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { assetActor } from './asset-actor';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
import { RejectProposalDto } from './dto/decision-bodies.dto';
/** /assets — pages members send in (proposals) and contracts read into a new asset. */
@ApiTags('assets')
@ApiBearerAuth()
@RequireModule('assets')
@Controller('assets')
export class AssetIntakeController {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly assetsQueueService: AssetsQueueService,
  ) {}

  /*
    A member sends a page in; somebody responsible decides.

    ⚠️ THE MEMBER NEVER CREATES AN ASSET. The raise routes carry NO permission
    decorator, and that is not an oversight — what they do is bounded by the
    caller's own id in the service: raise one, list your own, withdraw your own,
    look at your own page. Creating the thing lives behind `canManageAssets` on
    `/proposals/:id/accept`, where it belongs.

    Gating the raise on a permission would defeat the entire feature: the driver
    holding the rental agreement is precisely the person who holds nothing.

    ⚠️ The WHOLE proposals family is `@DenyExternal` — raising AND deciding. A
    proposal is a staff member asking for custody of the organization's
    property for themselves, with their rental agreement attached (home
    address, licence number, bank details). An external member holds no
    custody, so has nothing to propose — and deciding one means reading a
    colleague's personal paperwork, which is not a workspace's to share.
  */
  @Post('proposals/upload-url')
  @DenyExternal()
  @ApiOperation({ summary: 'A place to put the page' })
  async proposalUploadUrl(@Body() dto: ProposalPresignDto, @Request() req: AuthedRequest) {
    return this.assetsService.proposalPresign({
      ...dto,
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
    });
  }

  @Post('proposals')
  @DenyExternal()
  @ApiOperation({ summary: 'Send in a document that looks like a contract' })
  async raiseProposal(@Body() dto: RaiseProposalDto, @Request() req: AuthedRequest) {
    return this.assetsService.proposalRaise({
      ...dto,
      ...assetActor(req),
    });
  }

  /** What I have sent in, and what happened to it. Mine, so no permission. */
  @Get('proposals/mine')
  @DenyExternal()
  @ApiOperation({ summary: 'Documents I sent in' })
  async myProposals(@Request() req: AuthedRequest) {
    return this.assetsService.proposalMine({
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
    });
  }

  /*
    The queue — a DECIDER's queue, so it asks what deciding asks.

    In space: a Space Manager holds `canManageAssets` in their own depot, and
    the person a driver's page is for must be able to see it. The service
    narrows to what this caller may decide, by the same rule accept and reject
    refuse with (`mayReviewProposal` in shared).

    `?spaceId=` is a workspace's Assets tab asking for its OWN — narrowed in
    the service by `proposalInSpace`, ANDed with the scope above, never widening.
  */
  @Get('proposals/pending')
  @RequirePermissionInSpace('canManageAssets')
  @DenyExternal()
  @ApiOperation({ summary: 'Documents waiting on a decision' })
  async pendingProposals(@Query() query: PendingProposalsQueryDto, @Request() req: AuthedRequest) {
    return this.assetsService.proposalPending({
      spaceId: query?.spaceId,
      ...assetActor(req),
    });
  }

  /*
    Accepting one CREATES the thing, hands it over and can retire what it
    replaces — so it asks exactly what `/contracts/apply` asks, because it IS
    `/contracts/apply`, with the plan recomputed at this moment rather than
    frozen when the page was uploaded.

    ⚠️ In space, like apply. The request names a proposal, not a space, so the
    guard only asks "somewhere?" — the service refuses a proposal outside the
    caller's workspaces as not found, and apply refuses a kind outside them.
  */
  @Post('proposals/:id/accept')
  @RequirePermissionInSpace('canManageAssets')
  @DenyExternal()
  @ApiOperation({ summary: 'Create it, hand it over, retire what it replaces' })
  @ApiParam({ name: 'id', description: 'Proposal ID' })
  async acceptProposal(@Param('id') id: string, @Body() dto: AcceptProposalDto, @Request() req: AuthedRequest) {
    return this.assetsService.proposalAccept({
      id,
      ...dto,
      ...assetActor(req),
    });
  }

  @Post('proposals/:id/reject')
  @RequirePermissionInSpace('canManageAssets')
  @DenyExternal()
  @ApiOperation({ summary: 'Refuse it, with a reason the member reads' })
  @ApiParam({ name: 'id', description: 'Proposal ID' })
  async rejectProposal(@Param('id') id: string, @Body() body: RejectProposalDto, @Request() req: AuthedRequest) {
    return this.assetsService.proposalReject({
      id,
      note: body?.note,
      ...assetActor(req),
    });
  }

  /** The member changes their mind. Their own, and only while it waits. */
  @Post('proposals/:id/withdraw')
  @DenyExternal()
  @ApiOperation({ summary: 'Take back something I sent in' })
  @ApiParam({ name: 'id', description: 'Proposal ID' })
  async withdrawProposal(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.assetsService.proposalWithdraw({
      id,
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
    });
  }

  /*
    A short-lived link to one page. A POST, and nothing lists these: a rental
    agreement carries a home address, a licence number and bank details. The
    sender, or a reviewer whose queue would show it (decided in the service).
  */
  @Post('proposals/:id/document-url')
  @DenyExternal()
  @ApiOperation({ summary: 'A short-lived link to the page' })
  @ApiParam({ name: 'id', description: 'Proposal ID' })
  async proposalDocumentUrl(@Param('id') id: string, @Request() req: AuthedRequest) {
    return this.assetsService.proposalDocumentUrl({
      id,
      ...assetActor(req),
    });
  }

  /*
    A contract → a record, a handover, and the retirement of what it replaces.

    ⚠️ ALL THREE ASK `canManageAssets`, INCLUDING THE TWO THAT WRITE NOTHING.

    A preview ANSWERS A QUESTION ABOUT THE ORGANIZATION'S PROPERTY: give it a
    kind and a member and it says what that person is holding and what would
    be taken off the books. Reading the register does not buy that, and there
    is no caller for it — nobody previews a contract they cannot apply. (A POST
    on a read permission also trips `external-observer-writes.spec.ts`.)

    ⚠️ The proposal is computed on the SERVER on both preview and apply, from
    the kind and from what the member actually holds. The request carries the
    reading — a plate, a VIN — and never "close custody X, retire asset Y". A
    client that could name the record to retire could retire any record.

    ⚠️ IN SPACE. The request names a KIND, not a space, so the guard can only
    ask "somewhere?" — the service is the boundary: every kind is narrowed to
    the caller's own workspaces by the kind's real `spaceId`, and the rest is
    refused as not found. What it replaces is of THAT kind, so of that
    workspace too.

    External members: allowed, in their workspace — this is managing the
    workspace's own records, exactly as handing one over is. The text is pasted
    by the person applying it, not read out of a colleague's upload.
  */
  @Post('contracts/read')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Read a contract’s text into fields' })
  async readContract(@Body() dto: ReadContractDto, @Request() req: AuthedRequest) {
    return this.assetsService.contractRead({
      text: dto.text,
      ...assetActor(req),
    });
  }

  @Post('contracts/preview')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'What accepting this contract would do' })
  async previewContract(@Body() dto: ContractProposalDto, @Request() req: AuthedRequest) {
    return this.assetsService.contractPreview({
      ...dto,
      ...assetActor(req),
    });
  }

  @Post('contracts/apply')
  // Creates a record, reassigns the organization's property, and can take a
  // vehicle off the books. Nothing smaller than the write permission fits —
  // held org-wide, or in the workspace the kind belongs to.
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Create it, hand it over, retire what it replaces' })
  async applyContract(@Body() dto: ContractProposalDto, @Request() req: AuthedRequest) {
    return this.assetsService.contractApply({
      ...dto,
      ...assetActor(req),
    });
  }
}
