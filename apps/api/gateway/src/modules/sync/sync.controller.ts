import { Body, Controller, Get, HttpCode, Post, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { isAdmin, spacesGranting, type SyncOperation } from '@hbcfield/shared';
import { SyncPullQueryDto, SyncPushDto } from './dto/sync-push.dto';
import { SyncPullGatewayService } from './sync-pull.gateway.service';
import { SyncPushService } from './sync-push.service';

@ApiTags('sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(
    private readonly pushService: SyncPushService,
    private readonly pullService: SyncPullGatewayService,
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
    return this.pushService.push({ headers: req.headers, ip: req.ip }, dto.operations as SyncOperation[]);
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
}
