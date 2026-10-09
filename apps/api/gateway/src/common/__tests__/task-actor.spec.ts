import fs from 'fs';
import path from 'path';
import { Role } from '@hbcfield/shared';
import { of } from 'rxjs';
import { taskActor, taskRequester } from '../task-actor';
import { SearchController } from '../../modules/search/search.controller';
import { TasksController } from '../../modules/tasks/tasks.controller';

/**
 * One caller for every task route.
 *
 * The task caller used to be written out by hand ~80 times and the copies had
 * drifted — "Resume work" sent no space grants, and only some routes sent the
 * cross-org shares. These pin the one builder, and fail if a hand-written copy
 * comes back in the controllers that forward to the task gate.
 */
const member = (over: Record<string, unknown> = {}) => ({
  user: {
    id: 'u1',
    role: Role.EMPLOYEE,
    organizationId: 'o1',
    canViewAllTasks: false,
    canAssignTasks: false,
    access: {
      org: {},
      perSpace: { s1: { canViewAllTasks: true }, s2: { canAssignTasks: true } },
      sharedSpaces: [{ spaceId: 'x9' }],
    },
    ...over,
  },
});

describe('taskActor', () => {
  it('carries the space grants and, on a cross-org read, the shares together', () => {
    const a = taskActor({ ...member(), method: 'GET' } as any, { crossOrgRead: true });
    expect(a).toMatchObject({
      userId: 'u1',
      userRole: Role.EMPLOYEE,
      organizationId: 'o1',
      canViewAllTasks: false,
      canAssignTasks: false,
      viewAllSpaceIds: ['s1'],
      sharedSpaceIds: ['x9'],
    });
    expect(a.access).toBeDefined();
  });

  it('does not narrow an administrator or an org-wide grant', () => {
    expect(taskActor(member({ role: Role.ADMIN })).viewAllSpaceIds).toBeUndefined();
    const orgWide = member();
    (orgWide.user.access as any).org = { canViewAllTasks: true };
    expect(taskActor(orgWide).viewAllSpaceIds).toBeUndefined();
  });

  it('keeps "granted nowhere" as an EMPTY list, never as absent', () => {
    expect(taskActor(member({ access: { org: {}, perSpace: {} } })).viewAllSpaceIds).toEqual([]);
    expect(taskActor(member({ access: undefined })).sharedSpaceIds).toEqual([]);
  });

  it('taskRequester never carries a userId that could overwrite the person acted on', () => {
    const r = taskRequester(member());
    expect(r).not.toHaveProperty('userId');
    expect(r.requestUserId).toBe('u1');
    expect(r.viewAllSpaceIds).toEqual(['s1']);
  });
});

describe('task routes build no caller by hand', () => {
  const FILES = [
    'tasks/tasks.controller.ts',
    'reports/reports.controller.ts',
    'sync/sync.controller.ts',
    'custom-fields/custom-fields.controller.ts',
    'assets/assets.controller.ts',
    'assets/asset-categories.controller.ts',
  ];
  it.each(FILES)('%s', (file) => {
    const src = fs.readFileSync(path.join(__dirname, '../../modules', file), 'utf8');
    expect(src).not.toMatch(/viewAllSpaceIds\s*:/);
    expect(src).not.toMatch(/sharedSpaceIds\s*:/);
  });
});

describe('routes the lead named', () => {
  const spaceMember = member();

  it('search forwards the space grants and the shares', async () => {
    const taskClient = { send: jest.fn(() => of({ tasks: [], spaces: [] })) };
    const c = new SearchController(taskClient as any, { send: jest.fn() } as any);
    await c.search('pump', spaceMember);
    expect((taskClient.send.mock.calls[0] as any)[1]).toMatchObject({ viewAllSpaceIds: ['s1'], sharedSpaceIds: ['x9'], query: 'pump' });
  });

  it('a subtask carries the assigning right, org-wide and per space', async () => {
    const queue = { createSubtask: jest.fn() };
    const c = new TasksController(queue as any, {} as any);
    await c.createSubtask('p1', { title: 'x' } as any, spaceMember);
    expect(queue.createSubtask).toHaveBeenCalledWith(expect.objectContaining({ canAssignTasks: false, assignSpaceIds: ['s2'], parentId: 'p1' }));
  });

  it('resume carries the space grants it used to drop', async () => {
    const queue = { resumeWork: jest.fn() };
    const c = new TasksController(queue as any, {} as any);
    await c.resumeWork('t1', {} as any, spaceMember);
    // A write: the space grants travel, a guest's shares never do.
    expect(queue.resumeWork).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', viewAllSpaceIds: ['s1'], sharedSpaceIds: [] }));
  });
});

describe('taskActor — shared spaces are read, never written', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { taskActor: actor } = require('../task-actor');
  const user = { id: 'g1', role: 'EMPLOYEE', organizationId: 'guest-org', canViewAllTasks: true, access: { org: {}, perSpace: {}, sharedSpaces: [{ spaceId: 'host-space' }] } };

  it('only a read that opts in carries the shared spaces', () => {
    expect(actor({ user, method: 'GET' }, { crossOrgRead: true }).sharedSpaceIds).toEqual(['host-space']);
    // A report, comments or the timeline: a share never said so.
    expect(actor({ user, method: 'GET' }).sharedSpaceIds).toEqual([]);
  });

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])('a %s carries none — a guest’s own-org grant must not write a host’s job', (method) => {
    expect(actor({ user, method }, { crossOrgRead: true }).sharedSpaceIds).toEqual([]);
  });
});
