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
const EMPTY = { data: [] as unknown[] };
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

    const call = (client: ClientProxy, cmd: string, payload: Record<string, unknown>) =>
      firstValueFrom(
        client.send({ cmd }, payload).pipe(
          timeout(4000),
          catchError(() => of(EMPTY)),
        ),
      ).catch(() => EMPTY);

    const [tasksRes, membersRes, spacesRes, customersRes] = await Promise.all([
      call(this.taskClient, 'find_all_tasks', {
        search: query, page: 1, limit: LIMIT,
        organizationId: org, userId: user.id, userRole: user.role,
        canViewAllTasks: canAll, canAssignTasks: !!user.canAssignTasks,
      }),
      canAll ? call(this.authClient, 'list_technicians', { search: query, organizationId: org, page: 1, limit: LIMIT }) : Promise.resolve(EMPTY),
      canAll ? call(this.taskClient, 'find_all_locations', { search: query, organizationId: org, page: 1, limit: LIMIT }) : Promise.resolve(EMPTY),
      canAll ? call(this.authClient, 'list_customers', { search: query, organizationId: org, page: 1, limit: LIMIT }) : Promise.resolve(EMPTY),
    ]);

    return {
      tasks: rows(tasksRes).slice(0, LIMIT).map((t) => ({ id: t.id, title: t.title, status: t.status })),
      members: rows(membersRes).slice(0, LIMIT).map((m) => ({ id: m.id, firstName: m.firstName ?? '', lastName: m.lastName ?? '', email: m.email ?? null, avatarUrl: m.avatarUrl ?? null })),
      spaces: rows(spacesRes).slice(0, LIMIT).map((s) => ({ id: s.id, name: s.name, address: s.address ?? null })),
      customers: rows(customersRes).slice(0, LIMIT).map((c) => ({ id: c.id, name: c.name, contactName: c.contactName ?? null })),
    };
  }
}
