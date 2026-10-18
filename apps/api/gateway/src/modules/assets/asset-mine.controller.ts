import { Controller, Get, Param, Query, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { RequirePermission, RequirePermissionInSpace, DenyExternal } from '../../common/decorators';
import { AssetsService } from './assets.service';
import { MyLogQueryDto } from './dto';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { assetActor } from './asset-actor';

import type { AuthedRequest } from '../../common/request.types';
import { callerOrgId } from '../../common/caller-org';
/**
 * /assets — the caller's own (what I hold, my expenses, my log), usage, orphans, a
 * member's custody. ⚠️ Registered BEFORE AssetsController: `usage`, `orphans`,
 * `mine` would otherwise be read as `:id`.
 */
@ApiTags('assets')
@ApiBearerAuth()
@RequireModule('assets')
@Controller('assets')
export class AssetMineController {
  constructor(
    private readonly assetsService: AssetsService,
  ) {}

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
  async billingUsage(@Request() req: AuthedRequest) {
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
  async listOrphans(@Request() req: AuthedRequest) {
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
  async mine(@Request() req: AuthedRequest) {
    return this.assetsService.custodyMine({
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
    });
  }

  /** What I have sent in, and what happened to it. Mine, so no permission. Custody's — staff only. */
  @Get('expenses/mine')
  @DenyExternal()
  @ApiOperation({ summary: 'Expenses I submitted' })
  async myExpenses(@Query('limit') limit: number, @Request() req: AuthedRequest) {
    return this.assetsService.expenseMine({
      limit,
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
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
  async myLog(@Query() query: MyLogQueryDto, @Request() req: AuthedRequest) {
    return this.assetsService.logMine({
      ...query,
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
    });
  }

  @Get('log/due-mine')
  @DenyExternal()
  @ApiOperation({ summary: 'What is due soon on the things I hold' })
  async myDue(@Request() req: AuthedRequest) {
    return this.assetsService.logDueMine({
      userId: req.user.id,
      organizationId: callerOrgId(req.user),
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
    @Request() req: AuthedRequest,
  ) {
    return this.assetsService.custodyForMember({
      memberId,
      open: open === 'true' || open === '1',
      ...assetActor(req),
    });
  }
}
