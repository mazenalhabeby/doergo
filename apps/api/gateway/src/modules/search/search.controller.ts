import { Controller, Get, Query, Inject, Request } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { firstValueFrom, timeout, catchError, of } from 'rxjs';
import { SERVICE_NAMES } from '@hbcfield/shared';

/**
 * Unified global search for the web command palette. Fans out to the existing
 * per-entity search cmds in parallel, org-scoped, and returns a compact,
 * uniform shape. Tasks are role-scoped by the task-service (a basic employee
 * only matches their own tasks); people / spaces / customers are only searched
 * for users who can view all tasks (managers, dispatchers, admins).
 */
const rows = (res: unknown): any[] => {
  const r = res as any;
  return Array.isArray(r) ? r : (r?.data ?? r?.items ?? []);
};

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(
    @Inject(SERVICE_NAMES.TASK) private readonly taskClient: ClientProxy,
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Global search across tasks, people, spaces and customers' })
  @ApiQuery({ name: 'q', required: true, description: 'Search text (min 2 chars)' })
  async search(@Query('q') q: string, @Request() req: any) {
    const query = (q ?? '').trim();
    const empty = { tasks: [], members: [], spaces: [], customers: [] };
    if (query.length < 2) return empty;

    const user = req.user;
    const org = user?.organizationId;
    if (!org) return empty;
    const canAll = !!user.canViewAllTasks;
    const LIMIT = 6;

    const call = <T>(client: ClientProxy, cmd: string, payload: Record<string, unknown>, fallback: T): Promise<T> =>
      firstValueFrom(
        client.send({ cmd }, payload).pipe(
          timeout(4000),
          catchError(() => of(fallback)),
        ),
      ).catch(() => fallback);

    // Two lightweight, org-scoped round-trips (task-service: tasks+spaces,
    // auth-service: people+customers). People/spaces/customers are only queried
    // for users who can view all tasks; a basic employee only gets their own tasks.
    const [taskRes, authRes] = await Promise.all([
      call<{ tasks?: unknown[]; spaces?: unknown[] }>(this.taskClient, 'search_tasks_and_spaces', {
        query, organizationId: org, userId: user.id, userRole: user.role,
        canViewAllTasks: canAll, limit: LIMIT,
      }, {}),
      canAll
        ? call<{ members?: unknown[]; customers?: unknown[] }>(this.authClient, 'search_people_and_customers', { query, organizationId: org, limit: LIMIT }, {})
        : Promise.resolve({}),
    ]);

    return {
      tasks: rows((taskRes as any).tasks).map((t) => ({ id: t.id, title: t.title, status: t.status })),
      members: rows((authRes as any).members).map((m) => ({ id: m.id, firstName: m.firstName ?? '', lastName: m.lastName ?? '', email: m.email ?? null, avatarUrl: m.avatarUrl ?? null })),
      spaces: rows((taskRes as any).spaces).map((s) => ({ id: s.id, name: s.name, address: s.address ?? null })),
      customers: rows((authRes as any).customers).map((c) => ({ id: c.id, name: c.name, contactName: c.contactName ?? null })),
    };
  }
}
