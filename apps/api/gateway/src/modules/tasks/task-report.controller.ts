import { Controller, Get, HttpStatus, Inject, Logger, Param, Query, Request } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { firstValueFrom, timeout } from 'rxjs';
import {
  parseClientCopyInclude,
  SERVICE_NAMES,
  assertServiceOk,
  presentSections,
  toReportRoute,
  type TaskReport,
  type TrackedTaskRoute,
} from '@hbcfield/shared';
import { taskActor } from '../../common/task-actor';
import { trackingVisibility } from '../../common/tracking-visibility';
import { TaskReportQueryDto } from './dto';
import { TasksService } from './tasks.service';
import { sendRpc, getTaskRoute } from '@hbcfield/shared/microservices';

import type { AuthedRequest } from '../../common/request.types';
/** A route is a nice-to-have on a report; it must never hold the report up. */
const ROUTE_TIMEOUT_MS = 5_000;

/**
 * The full report for ONE job (packages/shared/src/tasks/task-report.ts).
 *
 * task-service builds it, gates it (the normal task gate, 404) and cuts the
 * client copy. This route adds the one part that is not task-service's: the
 * route driven, which is tracking-service's data behind the gateway's own
 * `canViewTracking` question.
 *
 * ⚠️ NO `crossOrgRead`: a guest of a shared workspace reads the job, not its
 * report (comments, signatures, the service report) — a share has its own
 * switches and none of them is this.
 */
@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TaskReportController {
  private readonly logger = new Logger(TaskReportController.name);

  constructor(
    private readonly tasksService: TasksService,
    @Inject(SERVICE_NAMES.TRACKING) private readonly trackingClient: ClientProxy,
  ) {}

  @Get(':id/full-report')
  @ApiOperation({ summary: 'The full report for one job — the office copy, or the client copy cut on the server' })
  async fullReport(@Param('id') id: string, @Query() query: TaskReportQueryDto, @Request() req: AuthedRequest) {
    const copy = query.copy ?? 'office';
    const actor = taskActor(req);
    const tracking = trackingVisibility(req.user);
    // A client copy carries the route only when the office chose to add it.
    const wantsRoute = copy === 'office' || (parseClientCopyInclude(query.include) ?? []).includes('route');
    // Asked of tracking-service IN PARALLEL, and only where it could possibly be shown.
    const mayAskRoute = wantsRoute && (tracking.canViewTracking || (tracking.trackingSpaceIds?.length ?? 0) > 0);

    const [res, route] = await Promise.all([
      this.tasksService.fullReport({ id, copy, include: query.include, issuer: query.issuer, ...actor }),
      mayAskRoute ? this.routeOf(id, actor.organizationId) : Promise.resolve(null),
    ]);
    const report = (assertServiceOk(res, HttpStatus.NOT_FOUND) as { data: TaskReport }).data;

    /*
      ⚠️ The ROUTE is shown only when ALL hold: the office copy, the workspace
      tracks routes (task-service left a `route: null` placeholder — it knows the
      modules), and the reader may see where people are (`canViewTracking`
      org-wide, or held in THIS job's workspace). Anything else — including any
      tracking failure — removes the section; it never fails the report.
    */
    if (report.route !== undefined) {
      const spaceId = report.header.workspace?.id;
      const chosen = report.meta.copy === 'office' || (report.meta.include ?? []).includes('route');
      const allowed =
        chosen && (tracking.canViewTracking || (!!spaceId && (tracking.trackingSpaceIds ?? []).includes(spaceId)));
      if (allowed && route) report.route = toReportRoute(route, report.header.site);
      else delete report.route;
      report.meta.sections = presentSections(report);
    }
    return { ...(res as object), data: report };
  }

  /** The tracked route, or null — a slow or failing tracking-service costs the report nothing. */
  private async routeOf(taskId: string, organizationId: string): Promise<TrackedTaskRoute | null> {
    try {
      const res: { success?: boolean; data?: unknown } | null = await firstValueFrom(
        sendRpc(this.trackingClient, getTaskRoute, { taskId, organizationId }).pipe(timeout(ROUTE_TIMEOUT_MS)),
      );
      return res?.success === true && res.data ? (res.data as TrackedTaskRoute) : null;
    } catch (err: unknown) {
      this.logger.warn(`Route for report of task ${taskId} unavailable: ${(err as Error | undefined)?.message ?? err}`);
      return null;
    }
  }
}
