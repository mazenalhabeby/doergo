import { ServiceCalls, ServiceLine } from '../../common/microservices/service-calls';
import { Controller, Get, Query, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { of } from 'rxjs';
import { taskActor } from '../../common/task-actor';
import { type RpcContract, searchTasksAndSpaces, searchPeopleAndCustomers } from '@hbcfield/shared/microservices';

import type { AuthedRequest } from '../../common/request.types';
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
  constructor(private readonly services: ServiceCalls) {}

  @Get()
  @ApiOperation({ summary: 'Global search across tasks, people, spaces and customers' })
  @ApiQuery({ name: 'q', required: true, description: 'Search text (min 2 chars)' })
  async search(@Query('q') q: string, @Request() req: AuthedRequest) {
    // Cap length (defense against oversized/abusive patterns) and require >= 2 chars.
    const query = (q ?? '').trim().slice(0, 100);
    const empty = { tasks: [], members: [], spaces: [], customers: [] };
    if (query.length < 2) return empty;

    const user = req.user;
    const org = user?.organizationId;
    if (!org) return empty;
    const canAll = !!user.canViewAllTasks;
    const LIMIT = 6;

    // A slow or failing half answers with nothing rather than holding the search (4 s each).
    const call = <Req, T>(
      line: ServiceLine,
      contract: RpcContract<Req, unknown>,
      payload: Req,
      fallback: T,
    ): Promise<T> =>
      line.ask(contract, payload, { timeoutMs: 4000 }).then(
        (r) => r as T,
        () => fallback,
      );

    // Two lightweight, org-scoped round-trips (task-service: tasks+spaces,
    // auth-service: people+customers). People/spaces/customers are only queried
    // for users who can view all tasks; a basic employee only gets their own tasks.
    const [taskRes, authRes] = await Promise.all([
      // The task gate's own caller (common/task-actor.ts): a supervisor granted
      // "view all tasks" in a SPACE finds that space's tasks, and a guest the
      // tasks of a space shared with them — the same set GET /tasks lists.
      call(
        this.services.task,
        searchTasksAndSpaces,
        {
          query,
          limit: LIMIT,
          ...taskActor(req, { crossOrgRead: true }),
        },
        {} as { tasks?: unknown[]; spaces?: unknown[] },
      ),
      canAll
        ? call(
            this.services.auth,
            searchPeopleAndCustomers,
            { query, organizationId: org, limit: LIMIT },
            {} as { members?: unknown[]; customers?: unknown[] },
          )
        : Promise.resolve({}),
    ]);

    return {
      tasks: rows((taskRes as any).tasks).map((t) => ({ id: t.id, title: t.title, status: t.status })),
      members: rows((authRes as any).members).map((m) => ({
        id: m.id,
        firstName: m.firstName ?? '',
        lastName: m.lastName ?? '',
        email: m.email ?? null,
        avatarUrl: m.avatarUrl ?? null,
      })),
      spaces: rows((taskRes as any).spaces).map((s) => ({ id: s.id, name: s.name, address: s.address ?? null })),
      customers: rows((authRes as any).customers).map((c) => ({
        id: c.id,
        name: c.name,
        contactName: c.contactName ?? null,
      })),
    };
  }
}
