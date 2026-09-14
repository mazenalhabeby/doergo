import { Body, Controller, Get, Header, HttpCode, NotFoundException, Post, Query, Request, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { Public, RequirePermission } from '../../common/decorators';
import { SyncHealthStore } from './sync-health.store';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { isAdmin, spacesGranting, type SyncOperation } from '@hbcfield/shared';
import { SyncMediaLinksDto, SyncPullQueryDto, SyncPushDto, SyncTelemetryDto } from './dto/sync-push.dto';
import { SyncPullGatewayService } from './sync-pull.gateway.service';
import { SyncPushService } from './sync-push.service';

@ApiTags('sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(
    private readonly pushService: SyncPushService,
    private readonly pullService: SyncPullGatewayService,
    private readonly health: SyncHealthStore,
    private readonly config: ConfigService,
  ) {}

  /**
   * Apply operations a phone queued, in order, exactly once each.
   *
   * No role decorator of its own: every operation is replayed against its real
   * route, which carries that route's roles, permissions and module gates. A
   * member can push only what they could have done online.
   */
  @Post('push')
  @HttpCode(200)
  // Its own budget: a phone back from a day offline pushes a few batches in a
  // row, and each batch already bounds itself to 50 operations.
  @Throttle({ short: { limit: 5, ttl: 1000 }, medium: { limit: 20, ttl: 10_000 }, long: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Apply queued offline operations' })
  async push(@Body() dto: SyncPushDto, @Request() req: any) {
    const response = await this.pushService.push({ headers: req.headers, ip: req.ip }, dto.operations as SyncOperation[]);
    void this.health.countResults(response.results);
    return response;
  }

  /**
   * What changed in one part of the member's world since their cursor.
   *
   * The visibility facts are the same ones the task list is given, from the
   * verified token — never from the query — so the offline copy is exactly the
   * set the member could open online.
   */
  @Get('pull')
  @ApiOperation({ summary: 'Changes since a cursor, per scope' })
  async pull(@Query() query: SyncPullQueryDto, @Request() req: any) {
    return this.pullService.pull({
      scope: query.scope,
      cursor: query.cursor ?? null,
      limit: query.limit,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      organizationId: req.user.organizationId,
    });
  }

  /** How this phone's queue is doing. Counts and ages only; the latest report replaces the last. */
  @Post('telemetry')
  @HttpCode(204)
  @Throttle({ short: { limit: 2, ttl: 1000 }, medium: { limit: 5, ttl: 60_000 }, long: { limit: 30, ttl: 3_600_000 } })
  @ApiOperation({ summary: "Report this phone's sync queue health" })
  async telemetry(@Body() dto: SyncTelemetryDto, @Request() req: any) {
    await this.health.record({ userId: req.user.id, organizationId: req.user.organizationId }, dto);
  }

  /**
   * Whose phone is still holding work, and why — the office's Phone sync tab.
   *
   * Counts, ages and reason codes only; never the work itself. The caller's
   * organization comes from the token. `canManageUsers` because it is a view of
   * people, and an external member can never hold that org-level permission.
   */
  @Get('health')
  @RequirePermission('canManageUsers')
  @ApiOperation({ summary: "Members' phone sync health (counts only)" })
  async memberHealth(@Request() req: any) {
    return this.health.forOrganization(req.user.organizationId);
  }

  /**
   * Offline sync health for Prometheus.
   *
   * ⚠️ Not a public page: it answers only a bearer token equal to METRICS_TOKEN,
   * compared in constant time, and does not exist at all when that is unset —
   * a 404, not an open door. Organization ids are labels; members never are.
   */
  @Public()
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4')
  @ApiOperation({ summary: 'Offline sync metrics (Prometheus, token-protected)' })
  async metrics(@Request() req: any) {
    const expected = this.config.get<string>('METRICS_TOKEN');
    if (!expected) throw new NotFoundException();
    const given = String(req.headers?.authorization ?? '').replace(/^Bearer\s+/i, '');
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
    return this.health.metrics();
  }

  /** Short-lived links to task photos the member may see, for the offline image cache. */
  @Post('media-links')
  @HttpCode(200)
  @ApiOperation({ summary: 'Signed links for task photos, for offline viewing' })
  async mediaLinks(@Body() dto: SyncMediaLinksDto, @Request() req: any) {
    return this.pullService.mediaLinks({
      ids: dto.ids,
      userId: req.user.id,
      userRole: req.user.role,
      canViewAllTasks: req.user.canViewAllTasks,
      viewAllSpaceIds: isAdmin(req.user) ? undefined : (spacesGranting(req.user?.access, 'canViewAllTasks') ?? undefined),
      organizationId: req.user.organizationId,
    });
  }
}
