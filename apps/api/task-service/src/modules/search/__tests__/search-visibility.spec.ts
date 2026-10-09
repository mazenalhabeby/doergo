import { Role } from '@hbcfield/shared';
import { SearchService } from '../search.service';
import { buildTaskVisibilityWhere } from '../../tasks/task-visibility';

/**
 * The command palette finds what the task list shows — one visibility rule
 * (task-visibility.ts). Its own copy asked only "admin, org-wide view, or
 * assigned to me": a supervisor with "view all tasks" in ONE workspace found
 * nothing of it, and a task in a space shared with the organization was never
 * found at all.
 */
describe('SearchService — the task list’s visibility', () => {
  const prisma: any = {
    task: { findMany: jest.fn().mockResolvedValue([]) },
    companyLocation: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const svc = new SearchService(prisma);
  const base = { organizationId: 'org-1', userId: 'u-1', query: 'pump' };
  const taskWhere = () => prisma.task.findMany.mock.calls[0][0].where;
  beforeEach(() => jest.clearAllMocks());

  it('uses buildTaskVisibilityWhere for a space-scoped viewer, ANDed with the text match', async () => {
    await svc.search({ ...base, userRole: Role.EMPLOYEE, viewAllSpaceIds: ['space-A'] });
    const facts = { userId: 'u-1', userRole: Role.EMPLOYEE, viewAllSpaceIds: ['space-A'], organizationId: 'org-1', canViewAllTasks: undefined };
    expect(taskWhere().AND[0]).toEqual(buildTaskVisibilityWhere(facts));
    expect(JSON.stringify(taskWhere())).toContain('"spaceId":{"in":["space-A"]}');
  });

  it('a member with no view grant still only matches their own assignments', async () => {
    await svc.search({ ...base, userRole: Role.EMPLOYEE });
    const w = JSON.stringify(taskWhere());
    expect(w).toContain('"assignedToId":"u-1"');
    expect(w).not.toContain('"spaceId"');
  });

  it('adds tasks in a space shared with the organization, as the list does', async () => {
    await svc.search({ ...base, userRole: Role.EMPLOYEE, sharedSpaceIds: ['shared-1'] });
    expect(taskWhere().AND[0].OR).toContainEqual({ spaceId: { in: ['shared-1'] } });
  });

  it('lists only the caller’s own workspaces to a space-scoped viewer; nothing to a plain member', async () => {
    await svc.search({ ...base, userRole: Role.EMPLOYEE, viewAllSpaceIds: ['space-A'] });
    expect(prisma.companyLocation.findMany.mock.calls[0][0].where.id).toEqual({ in: ['space-A'] });
    jest.clearAllMocks();
    await svc.search({ ...base, userRole: Role.EMPLOYEE });
    expect(prisma.companyLocation.findMany).not.toHaveBeenCalled();
  });

  it('caps the page with the shared clamp', async () => {
    await svc.search({ ...base, userRole: Role.ADMIN, limit: 9999 });
    expect(prisma.task.findMany.mock.calls[0][0].take).toBe(10);
  });
});
