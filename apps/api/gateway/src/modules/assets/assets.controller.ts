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
import { Role, isAdmin, spacesGranting } from '@hbcfield/shared';
import { RequirePermission, RequirePermissionInSpace, DenyExternal } from '../../common/decorators';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AssetsService } from './assets.service';
import { AssetsQueueService } from './assets.queue.service';
import {
  CreateAssetDto, UpdateAssetDto, AssetQueryDto, AssetListRowDto, UpdateAssetListRowDto,
  HandOverDto, ReceiptPresignDto, ReadReceiptDto, SubmitExpenseDto,
  ContractProposalDto, ReadContractDto,
  RaiseProposalDto, AcceptProposalDto, ProposalPresignDto,
  CreateLogEntryDto, LogPresignDto, LogListQueryDto, LogSummaryQueryDto, MyLogQueryDto,
} from './dto';
import { RequireModule } from '../../common/decorators/require-module.decorator';

@ApiTags('assets')
@ApiBearerAuth()
/*
  The organization's own property, not the work at a site.

  An external supervisor holds `canViewAllTasks` in their space — it is how they
  follow the work they are there to supervise — and this surface was gated on
  that same permission, so granting the first silently granted the second and an
  outsider could list the organization's records. The relationship disqualifies
  them, not the permission, so the rule is stated about the relationship.
*/
@DenyExternal()
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
    A WRITE, so it asks the WRITE permission.

    These were `canViewAllTasks` — a read permission authorising changes to the
    organization's equipment, which is how somebody given sight of the work
    quietly gains the ability to edit the asset register. `canManageAssets`
    exists precisely for this and was being bypassed.

    Nobody loses the ability: the migration granted `canManageAssets` to every
    role that already had it through the old gate.
  */
  @RequirePermission('canManageAssets')
  @ApiOperation({ summary: 'Create a new asset' })
  async create(@Body() dto: CreateAssetDto, @Request() req: any) {
    return this.assetsQueueService.create({
      ...dto,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  /*
    Space-aware: assets belong to a workspace through their kind, and the person
    who runs a workspace runs its equipment. The org-wide column alone refused
    them the list — while whoever passed it saw every workspace's assets. The
    service narrows by the caller's own spaces, so this widens the door and
    tightens what is behind it.
  */
  @Get()
  @RequirePermissionInSpace('canViewAllTasks')
  @ApiOperation({ summary: 'List assets — the organization’s, or one workspace’s' })
  async findAll(@Query() query: AssetQueryDto, @Request() req: any) {
    return this.assetsService.findAll({
      ...query,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      organizationId: req.user.organizationId,
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
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Billable assets per space' })
  async billingUsage(@Request() req: any) {
    return this.assetsService.billingUsage({ organizationId: req.user.organizationId });
  }

  /** Also before `:id` — see the note above. */
  @Get('orphans')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Assets that belong to no space' })
  async listOrphans(@Request() req: any) {
    return this.assetsService.listOrphans({
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  /*
    What the CALLER holds. Also before `:id` — see the note above.

    ⚠️ Deliberately NOT gated on `canViewAllTasks`. A driver is not an asset
    manager and never will be, and asking them to be one to see their own van is
    how a feature ends up unusable by the only people who need it. The FILTER is
    the authorization: the service can only ever return rows whose custody names
    the caller.
  */
  @Get('mine')
  @ApiOperation({ summary: 'What I hold right now' })
  async mine(@Request() req: any) {
    return this.assetsService.custodyMine({
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  /** What I have sent in, and what happened to it. Mine, so no permission. */
  @Get('expenses/mine')
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
  @ApiOperation({ summary: 'What is due soon on the things I hold' })
  async myDue(@Request() req: any) {
    return this.assetsService.logDueMine({
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  /** The office's queue: everything waiting on a decision. */
  @Get('expenses/pending')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Expenses waiting for a decision' })
  async pendingExpenses(@Query('limit') limit: number, @Request() req: any) {
    return this.assetsService.expensePending({
      limit,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  /*
    Accept an expense, or refuse it with a reason.

    A WRITE against the organization's books, so it asks the write permission —
    the same reasoning that moved every other asset mutation off
    `canViewAllTasks`.
  */
  @Post('expenses/:entryId/review')
  @RequirePermission('canManageAssets')
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
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  /*
    A link to the slip, minted here and short-lived.

    ⚠️ A POST, and no list anywhere returns a receipt URL. A URL handed out in
    bulk outlives the reason it was issued; minting one per request keeps
    looking at somebody's spending an act rather than a side effect of opening
    a page. Same rule as a member document's download link.
  */
  @Post('expenses/:entryId/receipt-url')
  @ApiOperation({ summary: 'A short-lived link to one receipt' })
  async receiptUrl(@Param('entryId') entryId: string, @Request() req: any) {
    return this.assetsService.expenseReceiptUrl({
      entryId,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canManageAssets: req.user.canManageAssets,
      organizationId: req.user.organizationId,
    });
  }

  /*
    A member sends a page in; somebody responsible decides.

    ⚠️ THE MEMBER NEVER CREATES AN ASSET. These four routes carry NO permission
    decorator, and that is not an oversight — what they do is bounded by the
    caller's own id in the service: raise one, list your own, withdraw your own,
    look at your own page. Creating the thing lives behind `canManageAssets` on
    `/proposals/:id/accept`, where it belongs.

    Gating the raise on a permission would defeat the entire feature: the driver
    holding the rental agreement is precisely the person who holds nothing.
  */
  @Post('proposals/upload-url')
  @ApiOperation({ summary: 'A place to put the page' })
  async proposalUploadUrl(@Body() dto: ProposalPresignDto, @Request() req: any) {
    return this.assetsService.proposalPresign({
      ...dto,
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  @Post('proposals')
  @ApiOperation({ summary: 'Send in a document that looks like a contract' })
  async raiseProposal(@Body() dto: RaiseProposalDto, @Request() req: any) {
    return this.assetsService.proposalRaise({
      ...dto,
      userId: req.user.id,
      userRole: req.user.role,
      canManageAssets: req.user.canManageAssets,
      organizationId: req.user.organizationId,
    });
  }

  /** What I have sent in, and what happened to it. Mine, so no permission. */
  @Get('proposals/mine')
  @ApiOperation({ summary: 'Documents I sent in' })
  async myProposals(@Request() req: any) {
    return this.assetsService.proposalMine({
      userId: req.user.id,
      organizationId: req.user.organizationId,
    });
  }

  /** The queue. A read of other people's, so it asks to be allowed to look. */
  @Get('proposals/pending')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Documents waiting on a decision' })
  async pendingProposals(@Request() req: any) {
    return this.assetsService.proposalPending({
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  /*
    Accepting one CREATES the thing, hands it over and can retire what it
    replaces — so it asks exactly what `/contracts/apply` asks, because it IS
    `/contracts/apply`, with the plan recomputed at this moment rather than
    frozen when the page was uploaded.
  */
  @Post('proposals/:id/accept')
  @RequirePermission('canManageAssets')
  @ApiOperation({ summary: 'Create it, hand it over, retire what it replaces' })
  @ApiParam({ name: 'id', description: 'Proposal ID' })
  async acceptProposal(@Param('id') id: string, @Body() dto: AcceptProposalDto, @Request() req: any) {
    return this.assetsService.proposalAccept({
      id,
      ...dto,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Post('proposals/:id/reject')
  @RequirePermission('canManageAssets')
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
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  /** The member changes their mind. Their own, and only while it waits. */
  @Post('proposals/:id/withdraw')
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
    agreement carries a home address, a licence number and bank details.
  */
  @Post('proposals/:id/document-url')
  @ApiOperation({ summary: 'A short-lived link to the page' })
  @ApiParam({ name: 'id', description: 'Proposal ID' })
  async proposalDocumentUrl(@Param('id') id: string, @Request() req: any) {
    return this.assetsService.proposalDocumentUrl({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      canManageAssets: req.user.canManageAssets,
      organizationId: req.user.organizationId,
    });
  }

  /*
    A contract → a record, a handover, and the retirement of what it replaces.

    ⚠️ ALL THREE ASK `canManageAssets`, INCLUDING THE TWO THAT WRITE NOTHING.

    The obvious split — read and preview are reads, so gate them on
    `canViewAllTasks` — is wrong twice over. First, a preview ANSWERS A QUESTION
    ABOUT THE ORGANIZATION'S PROPERTY: give it a kind and a member and it says
    what that person is holding and what would be taken off the books. An
    external supervisor holds `canViewAllTasks` in their space, and enumerating
    the fleet a member drives is not something being shown a site should buy.
    Second, there is no caller: nobody previews a contract they cannot apply.

    A POST that writes nothing also trips `external-observer-writes.spec.ts`,
    which is the guard doing its job — the shape it flags is exactly the one
    that has leaked twice in this codebase. Answering it by widening the guard
    would be answering a real question with an exception.

    ⚠️ The proposal is computed on the SERVER on both preview and apply, from
    the kind and from what the member actually holds. The request carries the
    reading — a plate, a VIN — and never "close custody X, retire asset Y". A
    client that could name the record to retire could retire any record.
  */
  @Post('contracts/read')
  @RequirePermission('canManageAssets')
  @ApiOperation({ summary: 'Read a contract’s text into fields' })
  async readContract(@Body() dto: ReadContractDto, @Request() req: any) {
    return this.assetsService.contractRead({
      text: dto.text,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Post('contracts/preview')
  @RequirePermission('canManageAssets')
  @ApiOperation({ summary: 'What accepting this contract would do' })
  async previewContract(@Body() dto: ContractProposalDto, @Request() req: any) {
    return this.assetsService.contractPreview({
      ...dto,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Post('contracts/apply')
  // Creates a record, reassigns the organization's property, and can take a
  // vehicle off the books. Nothing smaller than the write permission fits.
  @RequirePermission('canManageAssets')
  @ApiOperation({ summary: 'Create it, hand it over, retire what it replaces' })
  async applyContract(@Body() dto: ContractProposalDto, @Request() req: any) {
    return this.assetsService.contractApply({
      ...dto,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  /** Everything one member holds or has held — the other half of a timeline. */
  @Get('custody/member/:memberId')
  @RequirePermission('canViewAllTasks')
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
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Get asset by ID' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.assetsService.findOne({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id')
  @RequirePermission('canManageAssets')
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
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id')
  // Destructive and irreversible. Now its own capability rather than a share of
  // canManageUsers, which also grants members, invitations and workspaces —
  // bridged in auth-service, so today's set is unchanged.
  @RequirePermission('canManageAssets')
  @ApiOperation({ summary: 'Delete an asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.assetsQueueService.delete({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  // Both are ':id'-prefixed, so they cannot be swallowed by the ':id' route the
  // way a literal segment would be.
  @Get(':id/activities')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'What happened to this asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async listActivities(@Param('id') id: string, @Request() req: any) {
    return this.assetsService.listActivities({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/activities')
  @RequirePermission('canManageAssets')
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
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id/money')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Money logged against this asset, with totals' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async listMoney(@Param('id') id: string, @Query('limit') limit: number, @Request() req: any) {
    return this.assetsService.listMoney({
      id,
      limit,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/money')
  // Financial record against an asset — not a read (AS-B1).
  @RequirePermission('canManageAssets')
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
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id/money/:entryId')
  @RequirePermission('canManageAssets')
  @ApiOperation({ summary: 'Remove one money entry' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiParam({ name: 'entryId', description: 'Entry ID' })
  async removeMoney(@Param('id') id: string, @Param('entryId') entryId: string, @Request() req: any) {
    return this.assetsService.removeMoney({
      id,
      entryId,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Get(':id/rows')
  @RequirePermission('canViewAllTasks')
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
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Post(':id/rows')
  @RequirePermission('canManageAssets')
  @ApiOperation({ summary: 'Add a row to one of this asset\'s tables' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async addRow(@Param('id') id: string, @Body() dto: AssetListRowDto, @Request() req: any) {
    return this.assetsService.addRow({
      id,
      list: dto.list,
      values: dto.values,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Patch(':id/rows/:rowId')
  @RequirePermission('canManageAssets')
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
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  @Delete(':id/rows/:rowId')
  @RequirePermission('canManageAssets')
  @ApiOperation({ summary: 'Remove one row' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiParam({ name: 'rowId', description: 'Row ID' })
  async removeRow(@Param('id') id: string, @Param('rowId') rowId: string, @Request() req: any) {
    return this.assetsService.removeRow({
      id, rowId,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  /*
    Who has held this, and what it cost each of them.

    The costs are NOT stored against a holder — every entry carries the date the
    money moved, and the split is computed from the periods. Two versions of
    that truth would disagree the first time somebody corrected a handover date.
  */
  @Get(':id/custody')
  @RequirePermission('canViewAllTasks')
  @ApiOperation({ summary: 'Who has held this, and what it cost them' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async custody(@Param('id') id: string, @Request() req: any) {
    return this.assetsService.custodyTimeline({
      id,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  /** Hand it to somebody — or take it back, by sending nobody. */
  @Post(':id/custody')
  @RequirePermission('canManageAssets')
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
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }

  /*
    A place to put the photograph. Bytes go phone → S3 directly; nothing large
    passes through here.

    No permission decorator, and that is the point: what a member may file
    against is what they HELD ON THAT DATE, which is a fact about custody and
    not about a role. The service checks it.
  */
  @Post(':id/expenses/presign')
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
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canManageAssets: req.user.canManageAssets,
      organizationId: req.user.organizationId,
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
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canManageAssets: req.user.canManageAssets,
      organizationId: req.user.organizationId,
    });
  }

  /** File it. Counted only once somebody with the register accepts it. */
  @Post(':id/expenses')
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
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canManageAssets: req.user.canManageAssets,
      organizationId: req.user.organizationId,
    });
  }

  // ============================================
  // LOGBOOK — what gets done to a thing, and when it is due again
  // ============================================

  /*
    Reading one asset's log. `InSpace` widens the door to whoever runs the
    asset's workspace; the SERVICE checks the asset's own space, which is the
    boundary — the guard cannot know an asset's space from its id.
  */
  @Get(':id/log')
  @RequirePermissionInSpace('canViewAllTasks')
  @ApiOperation({ summary: 'The logbook of one asset, newest first' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async listLog(@Param('id') id: string, @Query() query: LogListQueryDto, @Request() req: any) {
    return this.assetsService.logList({ id, ...query, ...this.reader(req) });
  }

  @Get(':id/log/summary')
  @RequirePermissionInSpace('canViewAllTasks')
  @ApiOperation({ summary: 'Latest readings, next due, and who spent what in a period' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async logSummary(@Param('id') id: string, @Query() query: LogSummaryQueryDto, @Request() req: any) {
    return this.assetsService.logSummary({ id, ...query, ...this.reader(req) });
  }

  /*
    Filing an entry, and the upload link for its photo.

    ⚠️ NO PERMISSION DECORATOR, exactly like the expense routes: a driver files
    fuel against the van they HELD that day, which is a fact about custody the
    service checks — `canManageAssets` here would lock out everybody the logbook
    exists for. A type that is not holder-only is also open to whoever can see
    the asset (the colleague who noticed the dent), decided in the service too.
  */
  @Post(':id/log/presign')
  @ApiOperation({ summary: 'Upload URL for a logbook photo' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async presignLog(@Param('id') id: string, @Body() dto: LogPresignDto, @Request() req: any) {
    return this.assetsService.logPresign({ id, ...dto, ...this.reader(req) });
  }

  @Post(':id/log')
  @ApiOperation({ summary: 'Log something done to this asset' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  async createLog(@Param('id') id: string, @Body() dto: CreateLogEntryDto, @Request() req: any) {
    return this.assetsService.logCreate({ id, ...dto, ...this.reader(req) });
  }

  /*
    Remove an entry. No decorator: an author may WITHDRAW their own while it is
    still waiting, and only `canManageAssets` removes anything else — both
    decided in the service, which knows whose entry it is and its status.
  */
  @Delete(':id/log/:entryId')
  @ApiOperation({ summary: 'Remove a logbook entry' })
  @ApiParam({ name: 'id', description: 'Asset ID' })
  @ApiParam({ name: 'entryId', description: 'Entry ID' })
  async removeLog(@Param('id') id: string, @Param('entryId') entryId: string, @Request() req: any) {
    return this.assetsService.logRemove({ id, entryId, ...this.reader(req) });
  }

  /** Everything the logbook's service needs to decide about the caller, in one place. */
  private reader(req: any) {
    return {
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      canManageAssets: req.user.canManageAssets,
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      organizationId: req.user.organizationId,
    };
  }

  @Get(':id/history')
  @RequirePermission('canViewAllTasks')
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
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      organizationId: req.user.organizationId,
    });
  }
}
