import { Role } from '@hbcfield/shared';
import { normalizeQueryParams } from '../tasks.controller';
import { tasksControllers } from './tasks-controllers.fixture';

/**
 * The gateway's half of the task scope rules: it must SEND the facts the
 * task-service decides on, and it must not forward a query object that Prisma
 * would read as an operator.
 *
 *   • taskCreationScope was never forwarded, so task-service's SPACE check
 *     ("pick a workspace you are on") was dead code.
 *   • PUT /tasks/:id forwarded no create grants, PATCH /tasks/:id/assign no
 *     assign spaces — the service could not narrow what it was never told.
 *   • GET /tasks spread `?customerId[not]=x` ({ not: 'x' }) into the service.
 */
describe('TasksController — scope facts forwarded', () => {
  const queue = {
    createTask: jest.fn().mockResolvedValue({}),
    updateTask: jest.fn().mockResolvedValue({}),
    assignTask: jest.fn().mockResolvedValue({}),
  };
  const direct = { findAll: jest.fn().mockResolvedValue({}) };
  const controller = tasksControllers(queue as never, direct as never);

  /** A member who may create and assign only at site A, by a space role. */
  const siteMember = {
    id: 'u-1',
    role: Role.EMPLOYEE,
    organizationId: 'org-1',
    canCreateTasks: false,
    canAssignTasks: false,
    canViewAllTasks: false,
    taskCreationScope: 'SPACE',
    access: {
      org: {},
      perSpace: { 'space-A': { canCreateTasks: true, canAssignTasks: true } },
      sharedSpaces: [],
    },
    orgAddOns: [],
  };

  beforeEach(() => jest.clearAllMocks());

  it('create forwards the member’s taskCreationScope, and a body cannot set it', async () => {
    await controller.create({ title: 'x', taskCreationScope: 'ORG' } as never, { user: siteMember });
    expect(queue.createTask.mock.calls[0][0].taskCreationScope).toBe('SPACE');
  });

  it('an administrator is never narrowed by the column', async () => {
    await controller.create({ title: 'x' } as never, { user: { ...siteMember, role: Role.ADMIN } });
    expect(queue.createTask.mock.calls[0][0].taskCreationScope).toBe('ORG');
  });

  it('update forwards the create grants the service decides on', async () => {
    await controller.update('t-1', { title: 'y' } as never, { user: siteMember });
    const sent = queue.updateTask.mock.calls[0][0];
    expect(sent.canCreateTasks).toBe(false);
    expect(sent.createSpaceIds).toEqual(['space-A']);
  });

  it('assign forwards the spaces where the caller may assign', async () => {
    await controller.assign('t-1', { workerId: 'w' } as never, { user: siteMember });
    expect(queue.assignTask.mock.calls[0][0].assignSpaceIds).toEqual(['space-A']);
  });

  describe('normalizeQueryParams', () => {
    it('keeps strings, takes the first of a repeated param', () => {
      expect(normalizeQueryParams({ a: 'x', b: ['y', 'z'] })).toEqual({ a: 'x', b: 'y' });
    });

    it('drops bracket-built objects — never a Prisma operator', () => {
      expect(normalizeQueryParams({ customerId: { not: 'x' }, unitId: [{ in: ['a'] }], status: 'NEW' })).toEqual({
        status: 'NEW',
      });
    });
  });
});
