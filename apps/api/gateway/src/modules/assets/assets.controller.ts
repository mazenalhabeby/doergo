import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { RequirePermission, RequirePermissionInSpace, DenyExternal } from '../../common/decorators';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AssetsService } from './assets.service';
import { AssetsQueueService } from './assets.queue.service';
import {
  CreateAssetDto, UpdateAssetDto, AssetQueryDto, AssetListRowDto, UpdateAssetListRowDto,
  HandOverDto, ReceiptPresignDto, ReadReceiptDto, SubmitExpenseDto,
  ContractProposalDto, ReadContractDto,
  RaiseProposalDto, AcceptProposalDto, ProposalPresignDto, PendingProposalsQueryDto,
  CreateLogEntryDto, LogPresignDto, LogListQueryDto, LogSummaryQueryDto, MyLogQueryDto,
} from './dto';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { assetActor } from './asset-actor';

@ApiTags('assets')
@ApiBearerAuth()
/*
  The register is honoured PER WORKSPACE, at three levels — and the guard is
  only the door.

    canViewAssets   — read records, their history, money, custody and logbook
    canLogAssets    — add logbook entries and file expenses
    canManageAssets — create, edit, delete, hand over, money rows, contracts,
                      proposals

  Every gated route is `@RequirePermissionInSpace`: a grant held org-wide OR in
  a workspace opens it. The request names an asset, not a workspace, so the
  guard can only ask "somewhere?" — the SERVICE is the boundary. It reads the
  record's KIND (`AssetCategory.spaceId`; an asset has no workspace of its own)
  and answers 404 outside the caller's workspaces, exactly as for no such
  record. A record whose kind has no workspace is org-level, and only an
  org-wide grant reaches it.

  ⚠️ External members. This controller used to be closed to them outright
  (`@DenyExternal()` on the class), because asset reads rode on
  `canViewAllTasks` — the permission an external supervisor holds to follow
  the work — so granting sight of a site granted the equipment register with
  it. The register has its own keys now, granted on purpose, workspace by
  workspace. So the rule is the one every other workspace surface follows: an
  external member may do in THEIR workspace what their keys allow, and never
  outside it. What stays closed (per route, with the reason) is the
  organization's own custody system for its staff — what I hold, expenses filed
  by custody, proposals — because an external member holds no custody.
*/
/**
 * ⚠️ This had NO module gate. The register itself. Reads pass — an organization that switches Assets off
 * keeps sight of what it recorded; it just cannot add to it.
 *
 * ModuleGuard resolves the space from the request and falls back to the
 * organization's set when there is none, and it passes reads by design.
 */
@RequireModule('assets')
@Controller('assets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetsController {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly assetsQueueService: AssetsQueueService,
  ) {}

  @Post()
  /*
    A WRITE, so it asks the WRITE permission — held org-wide, or in the
    workspace of the KIND it is created in. The service checks the kind's real
    workspace (the body's `spaceId` is a hint for the module gate, never an
    authorisation), and a record with no kind — no workspace at all — is
    refused to anybody short of an org-wide manager.
  */
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Create a new asset' })
  async create(@Body() dto: CreateAssetDto, @Request() req: any) {
    return this.assetsQueueService.create({
      ...dto,
      ...assetActor(req),
    });
  }

  /*
    The organization's register, or one workspace's — narrowed in the service
    to the workspaces the caller may READ. `?spaceId=` is intersected with that,
    never trusted: it can narrow a view and never widen it.
  */
  @Get()
  @RequirePermissionInSpace('canViewAssets')
  @ApiOperation({ summary: 'List assets — the organization’s, or one workspace’s' })
  async findAll(@Query() query: AssetQueryDto, @Request() req: any) {
    return this.assetsService.findAll({
      ...query,
      ...assetActor(req),
    });
  }

  /*
    Declared BEFORE `:id`, and it has to stay there.

    Express matches in declaration order, so a static segment placed after a
    parameter route is never reached — `/assets/usage` would be read as an asset
    whose id is "usage" and answer 404. It has happened here before; the test in
    __tests__/route-order.spec.ts exists to stop it happening again.
  */
  @Get('usage')
  /*
    ⚠️ ORG-WIDE, like `orphans` below: these are the counts the BILL charges,
    for every workspace and for the CRM and portal ladders too — the
    organization's own business (`GET /billing/bill` is closed the same way).
    A workspace grant reads its own records, not the organization's bill. It
    was org-wide `canViewAllTasks` before; nobody loses it (the bridge carries
    that grant into `canViewAssets`). The service refuses anything short of
    org-wide as well, and an external member never holds an org-wide key —
    `@DenyExternal` says so in words.
  */
  @RequirePermission('canViewAssets')
  @DenyExternal()
  @ApiOperation({ summary: 'Billable assets per space' })
  async billingUsage(@Request() req: any) {
    return this.assetsService.billingUsage({ ...assetActor(req) });
  }

  /*
    Also before `:id` — see the note above.

    ⚠️ ORG-WIDE, deliberately the one read that is not `InSpace`: every row is
    in NO workspace, so no workspace grant reaches any of them. A depot manager
    shown these would see records outside every scope the rest of the register
    keeps them to. The service refuses anything short of `null` too.
  */
  @Get('orphans')
  @RequirePermission('canViewAssets')
  @DenyExternal()
  @ApiOperation({ summary: 'Assets that belong to no space' })
  async listOrphans(@Request() req: any) {
    return this.assetsService.listOrphans({ ...assetActor(req) });
  }

  /*
    What the CALLER holds. Also before `:id` — see the note above.

    ⚠️ Deliberately NOT gated on a permission. A driver is not an asset manager
    and never will be, and asking them to be one to see their own van is how a
    feature ends up unusable by the only people who need it. The FILTER is the
    authorization: the service can only ever return rows whose custody names
    the caller.

    `@DenyExternal`: custody is the organization's system for ITS staff. An
    external member holds nothing of the organization's, so this has nothing
    to show them — and must not start to the day a row names one by mistake.
  */
  @Get('mine')
  @DenyExternal()
  @ApiOperation({ summary: 'What I hold right now' })
  async mine(@Request() req: any) {
    return this.assetsService.custodyMine({
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  /** What I have sent in, and what happened to it. Mine, so no permission. Custody's — staff only. */
  @Get('expenses/mine')
  @DenyExternal()
  @ApiOperation({ summary: 'Expenses I submitted' })
  async myExpenses(@Query('limit') limit: number, @Request() req: any) {
    return this.assetsService.expenseMine({
      limit,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  /*
    The logbook, read by the member: what I logged, and what is due on what I
    hold. No permission, for the same reason as `mine` — the service filters by
    the caller's own id and open custody, so it can only return their own rows.
    Declared before `:id` so Express reaches them.

    `log/mine` stays open to an external member: it is the entries THEY wrote
    (through `canLogAssets` in their workspace) and what became of them.
    `log/due-mine` is custody — what is due on what I hold — and is staff only.
  */
  @Get('log/mine')
  @ApiOperation({ summary: 'Logbook entries I filed' })
  async myLog(@Query() query: MyLogQueryDto, @Request() req: any) {
    return this.assetsService.logMine({
      ...query,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Get('log/due-mine')
  @DenyExternal()
  @ApiOperation({ summary: 'What is due soon on the things I hold' })
  async myDue(@Request() req: any) {
    return this.assetsService.logDueMine({
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  /*
    The office's queue: everything waiting on a decision — of the records the
    caller may READ, narrowed in the service by each record's workspace. The
    same reach as each record's own Money tab, which lists these entries too.
  */
  @Get('expenses/pending')
  @RequirePermissionInSpace('canViewAssets')
  @ApiOperation({ summary: 'Expenses waiting for a decision' })
  async pendingExpenses(@Query('limit') limit: number, @Request() req: any) {
    return this.assetsService.expensePending({
      limit,
      ...assetActor(req),
    });
  }

  /*
    Accept an expense, or refuse it with a reason.

    A WRITE against the organization's books, so it asks the write permission —
    in the workspace of the record the slip was filed against, decided in the
    service, which answers another workspace's slip as "not waiting".
  */
  @Post('expenses/:entryId/review')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Accept or refuse a submitted expense' })
  async reviewExpense(
    @Param('entryId') entryId: string,
    @Body() body: { decision?: 'accept' | 'reject'; note?: string },
    @Request() req: any,
  ) {
    return this.assetsService.expenseReview({
      entryId,
      decision: body?.decision === 'reject' ? 'reject' : 'accept',
      note: body?.note,
      ...assetActor(req),
    });
  }

  /*
    A link to the slip, minted here and short-lived.

    ⚠️ A POST, and no list anywhere returns a receipt URL. A URL handed out in
    bulk outlives the reason it was issued; minting one per request keeps
    looking at somebody's spending an act rather than a side effect of opening
    a page. Same rule as a member document's download link.

    The author, or whoever may read that record's money (in its workspace).
    `@DenyExternal`: a receipt is a staff member's spending, filed through
    custody — the organization's own business.
  */
  @Post('expenses/:entryId/receipt-url')
  @DenyExternal()
  @ApiOperation({ summary: 'A short-lived link to one receipt' })
  async receiptUrl(@Param('entryId') entryId: string, @Request() req: any) {
    return this.assetsService.expenseReceiptUrl({
      entryId,
      ...assetActor(req),
    });
  }

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
  async proposalUploadUrl(@Body() dto: ProposalPresignDto, @Request() req: any) {
    return this.assetsService.proposalPresign({
      ...dto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Post('proposals')
  @DenyExternal()
  @ApiOperation({ summary: 'Send in a document that looks like a contract' })
  async raiseProposal(@Body() dto: RaiseProposalDto, @Request() req: any) {
    return this.assetsService.proposalRaise({
      ...dto,
      ...assetActor(req),
    });
  }

  /** What I have sent in, and what happened to it. Mine, so no permission. */
  @Get('proposals/mine')
  @DenyExternal()
  @ApiOperation({ summary: 'Documents I sent in' })
  async myProposals(@Request() req: any) {
    return this.assetsService.proposalMine({
      userId: req.user.id,
      organizationId: req.user.organizationId,
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
  async pendingProposals(@Query() query: PendingProposalsQueryDto, @Request() req: any) {
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
  async acceptProposal(@Param('id') id: string, @Body() dto: AcceptProposalDto, @Request() req: any) {
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
  async rejectProposal(
    @Param('id') id: string,
    @Body() body: { note?: string },
    @Request() req: any,
  ) {
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
  async withdrawProposal(@Param('id') id: string, @Request() req: any) {
    return this.assetsService.proposalWithdraw({
      id,
      userId: req.user.id,
      organizationId: req.user.organizationId,
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
  async proposalDocumentUrl(@Param('id') id: string, @Request() req: any) {
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
  async readContract(@Body() dto: ReadContractDto, @Request() req: any) {
    return this.assetsService.contractRead({
      text: dto.text,
      ...assetActor(req),
    });
  }

  @Post('contracts/preview')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'What accepting this contract would do' })
  async previewContract(@Body() dto: ContractProposalDto, @Request() req: any) {
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
  async applyContract(@Body() dto: ContractProposalDto, @Request() req: any) {
    return this.assetsService.contractApply({
      ...dto,
      ...assetActor(req),
    });
  }

  /*
    Everything one member holds or has held — the other half of a timeline.
    Only the records the caller may read: a depot manager sees the depot's vans
    this person has had, never what another workspace gave them.
  */
  @Get('custody/member/:memberId')
  @RequirePermissionInSpace('canViewAssets')
  @ApiOperation({ summary: 'What this member holds, and has held' })
  @ApiQuery({ name: 'open', required: false, description: 'Only what they hold now' })
  async custodyForMember(
    @Param('memberId') memberId: string,
    @Query('open') open: string,
    @Request() req: any,
  ) {
    return this.assetsService.custodyForMember({
      memberId,
      open: open === 'true' || open === '1',
      ...assetActor(req),
    });
  }

  @Get(':id')
  @RequirePermissionInSpace('canViewAssets')
  @ApiOperation({ summary: 'Get asset by ID' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.assetsService.findOne({
      id,
      ...assetActor(req),
    });
  }

  /*
    Asked of the record's workspace as it is AND of the kind it is moved to —
    moving a record to another kind is moving it to that kind's workspace.
  */
  @Patch(':id')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Update an asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAssetDto,
    @Request() req: any,
  ) {
    return this.assetsQueueService.update({
      id,
      ...dto,
      ...assetActor(req),
    });
  }

  @Delete(':id')
  // Destructive and irreversible: management, in the record's own workspace.
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Delete an asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.assetsQueueService.delete({
      id,
      ...assetActor(req),
    });
  }

  // Both are ':id'-prefixed, so they cannot be swallowed by the ':id' route the
  // way a literal segment would be.
  @Get(':id/activities')
  @RequirePermissionInSpace('canViewAssets')
  @ApiOperation({ summary: 'What happened to this asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async listActivities(@Param('id') id: string, @Request() req: any) {
    return this.assetsService.listActivities({
      id,
      ...assetActor(req),
    });
  }

  /*
    A note in the record's history. Management, not logging: the logbook is
    where use, fuel and damage are recorded (`canLogAssets`); the timeline is
    the record's own story, written by whoever runs it.
  */
  @Post(':id/activities')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Write a note against this asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async addActivity(
    @Param('id') id: string,
    @Body() body: { body?: string },
    @Request() req: any,
  ) {
    return this.assetsService.addActivity({
      id,
      body: body?.body ?? '',
      ...assetActor(req),
    });
  }

  @Get(':id/money')
  @RequirePermissionInSpace('canViewAssets')
  @ApiOperation({ summary: 'Money logged against this asset, with totals' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async listMoney(@Param('id') id: string, @Query('limit') limit: number, @Request() req: any) {
    return this.assetsService.listMoney({
      id,
      limit,
      ...assetActor(req),
    });
  }

  @Post(':id/money')
  // A money row is RECORDED as it is written — it moves the books with no
  // review — so it is management, not logging (AS-B1). A cost that waits for
  // the office goes through the logbook.
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Log money against this asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async addMoney(
    @Param('id') id: string,
    @Body() body: { category?: string; amountCents?: number; note?: string; occurredAt?: string },
    @Request() req: any,
  ) {
    return this.assetsService.addMoney({
      id,
      category: body?.category ?? '',
      amountCents: body?.amountCents ?? 0,
      note: body?.note,
      occurredAt: body?.occurredAt,
      ...assetActor(req),
    });
  }

  @Delete(':id/money/:entryId')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Remove one money entry' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiParam({ name: 'entryId', description: 'Entry ID' })
  async removeMoney(@Param('id') id: string, @Param('entryId') entryId: string, @Request() req: any) {
    return this.assetsService.removeMoney({
      id,
      entryId,
      ...assetActor(req),
    });
  }

  @Get(':id/rows')
  @RequirePermissionInSpace('canViewAssets')
  @ApiOperation({ summary: 'Rows of one table on this asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiQuery({ name: 'list', required: true })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listRows(
    @Param('id') id: string,
    @Query('list') list: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Request() req?: any,
  ) {
    return this.assetsService.listRows({
      id, list, search, page, limit,
      ...assetActor(req),
    });
  }

  @Post(':id/rows')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Add a row to one of this asset\'s tables' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async addRow(@Param('id') id: string, @Body() dto: AssetListRowDto, @Request() req: any) {
    return this.assetsService.addRow({
      id,
      list: dto.list,
      values: dto.values,
      ...assetActor(req),
    });
  }

  @Patch(':id/rows/:rowId')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Change one row' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiParam({ name: 'rowId', description: 'Row ID' })
  async updateRow(
    @Param('id') id: string,
    @Param('rowId') rowId: string,
    @Body() dto: UpdateAssetListRowDto,
    @Request() req: any,
  ) {
    return this.assetsService.updateRow({
      id, rowId,
      values: dto.values,
      ...assetActor(req),
    });
  }

  @Delete(':id/rows/:rowId')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Remove one row' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiParam({ name: 'rowId', description: 'Row ID' })
  async removeRow(@Param('id') id: string, @Param('rowId') rowId: string, @Request() req: any) {
    return this.assetsService.removeRow({
      id, rowId,
      ...assetActor(req),
    });
  }

  /*
    Who has held this, and what it cost each of them.

    The costs are NOT stored against a holder — every entry carries the date the
    money moved, and the split is computed from the periods. Two versions of
    that truth would disagree the first time somebody corrected a handover date.
  */
  @Get(':id/custody')
  @RequirePermissionInSpace('canViewAssets')
  @ApiOperation({ summary: 'Who has held this, and what it cost them' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async custody(@Param('id') id: string, @Request() req: any) {
    return this.assetsService.custodyTimeline({
      id,
      ...assetActor(req),
    });
  }

  /*
    Hand it to somebody — or take it back, by sending nobody.

    Reassigning a record of the workspace is managing it, so an external
    manager may do it in their workspace like any space manager. The record's
    workspace decides, in the service.
  */
  @Post(':id/custody')
  @RequirePermissionInSpace('canManageAssets')
  @ApiOperation({ summary: 'Hand this over' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async handOver(
    @Param('id') id: string,
    @Body() dto: HandOverDto,
    @Request() req: any,
  ) {
    return this.assetsService.custodyHandOver({
      id,
      ...dto,
      ...assetActor(req),
    });
  }

  /*
    A place to put the photograph. Bytes go phone → S3 directly; nothing large
    passes through here.

    No permission decorator, and that is the point: what a member may file
    against is what they HELD ON THAT DATE, which is a fact about custody and
    not about a role — or, for the office, `canLogAssets` in the record's
    workspace. The service checks both.

    `@DenyExternal` on all three expense routes: filing by custody is the
    organization's system for its staff. An external member with
    `canLogAssets` logs through the logbook below.
  */
  @Post(':id/expenses/presign')
  @DenyExternal()
  @ApiOperation({ summary: 'Upload URL for a receipt' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async presignReceipt(
    @Param('id') id: string,
    @Body() dto: ReceiptPresignDto,
    @Request() req: any,
  ) {
    return this.assetsService.expensePresign({
      id,
      ...dto,
      ...assetActor(req),
    });
  }

  /**
   * Read a PDF receipt before filing it.
   *
   * ⚠️ Deliberately NOT gated on a permission, exactly like the presign above.
   * What a member may read here is the file THEY just uploaded against
   * something they HELD on that date — a fact about custody, which the service
   * checks. `canManageAssets` here would lock every driver out of the one
   * screen built for them.
   *
   * Images are not read here: the phone reads those on-device, better and for
   * free. This exists for the file a phone cannot open at all.
   */
  @Post(':id/expenses/read')
  @DenyExternal()
  @ApiOperation({ summary: 'Read a PDF receipt I just uploaded' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async readReceipt(
    @Param('id') id: string,
    @Body() dto: ReadReceiptDto,
    @Request() req: any,
  ) {
    return this.assetsService.expenseRead({
      id,
      ...dto,
      ...assetActor(req),
    });
  }

  /** File it. Counted only once somebody who manages that record's workspace accepts it. */
  @Post(':id/expenses')
  @DenyExternal()
  @ApiOperation({ summary: 'File an expense against something I hold' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async submitExpense(
    @Param('id') id: string,
    @Body() dto: SubmitExpenseDto,
    @Request() req: any,
  ) {
    return this.assetsService.expenseSubmit({
      id,
      ...dto,
      ...assetActor(req),
    });
  }

  // ============================================
  // LOGBOOK — what gets done to a thing, and when it is due again
  // ============================================

  /*
    Reading one asset's log. `InSpace` widens the door to whoever may read the
    asset's workspace; the SERVICE checks the asset's own space, which is the
    boundary — the guard cannot know an asset's space from its id.
  */
  @Get(':id/log')
  @RequirePermissionInSpace('canViewAssets')
  @ApiOperation({ summary: 'The logbook of one asset, newest first' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async listLog(@Param('id') id: string, @Query() query: LogListQueryDto, @Request() req: any) {
    return this.assetsService.logList({ id, ...query, ...assetActor(req) });
  }

  @Get(':id/log/summary')
  @RequirePermissionInSpace('canViewAssets')
  @ApiOperation({ summary: 'Latest readings, next due, and who spent what in a period' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async logSummary(@Param('id') id: string, @Query() query: LogSummaryQueryDto, @Request() req: any) {
    return this.assetsService.logSummary({ id, ...query, ...assetActor(req) });
  }

  /*
    Filing an entry, and the upload link for its photo.

    ⚠️ NO PERMISSION DECORATOR, exactly like the expense routes: a driver files
    fuel against the van they HELD that day, which is a fact about custody the
    service checks — a permission here would lock out everybody the logbook
    exists for. A type that is not holder-only is also open to whoever holds
    `canLogAssets` in the record's workspace (the colleague who noticed the
    dent), and the office (`canManageAssets` there) logs anything — all three
    decided in the service.

    OPEN to an external member: `canLogAssets` in their workspace is exactly
    the key that lets them log there. They never pass on custody — the service
    refuses that path for an external member outright.
  */
  @Post(':id/log/presign')
  @ApiOperation({ summary: 'Upload URL for a logbook photo' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async presignLog(@Param('id') id: string, @Body() dto: LogPresignDto, @Request() req: any) {
    return this.assetsService.logPresign({ id, ...dto, ...assetActor(req) });
  }

  @Post(':id/log')
  @ApiOperation({ summary: 'Log something done to this asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async createLog(@Param('id') id: string, @Body() dto: CreateLogEntryDto, @Request() req: any) {
    return this.assetsService.logCreate({ id, ...dto, ...assetActor(req) });
  }

  /*
    Remove an entry. No decorator: an author may WITHDRAW their own while it is
    still waiting, and only the office — `canManageAssets` in the record's
    workspace — removes anything else; both decided in the service, which
    knows whose entry it is and its status.
  */
  @Delete(':id/log/:entryId')
  @ApiOperation({ summary: 'Remove a logbook entry' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiParam({ name: 'entryId', description: 'Entry ID' })
  async removeLog(@Param('id') id: string, @Param('entryId') entryId: string, @Request() req: any) {
    return this.assetsService.logRemove({ id, entryId, ...assetActor(req) });
  }

  @Get(':id/history')
  @RequirePermissionInSpace('canViewAssets')
  @ApiOperation({ summary: 'Get maintenance history for an asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'scope', required: false, enum: ['done', 'all'] })
  async getMaintenanceHistory(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('scope') scope?: 'done' | 'all',
    @Request() req?: any,
  ) {
    return this.assetsService.getMaintenanceHistory({
      id,
      page,
      limit,
      scope,
      ...assetActor(req),
    });
  }
}
