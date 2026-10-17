import { BadRequestException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { Role, TaskStatus } from '@hbcfield/shared';
import { assertMayMoveStatus, managesBoard } from '../task-status-gates';
import { assertDueBySiteDay } from '../task-status-checks';
import { statusUpdateData } from '../task-status-write';
import { ROLE_WAVE_CLOSED } from '../role-pool.service';

/** The steps updateStatus was split into, pinned where the service specs do not reach. */

const logger = { warn: jest.fn() } as unknown as Logger;
const task = (over: Record<string, unknown> = {}) =>
  ({
    id: 't1',
    organizationId: 'org',
    spaceId: 's1',
    status: 'NEW',
    pausedAt: null,
    dueDate: null,
    space: null,
    ...over,
  }) as any;
const input = (over: Record<string, unknown> = {}) =>
  ({
    id: 't1',
    status: TaskStatus.IN_PROGRESS,
    userId: 'u',
    userRole: Role.EMPLOYEE,
    organizationId: 'org',
    ...over,
  }) as any;

describe('who may move a task', () => {
  it('a manager is an ADMIN or a "view all tasks" holder', () => {
    expect(managesBoard(input({ userRole: Role.ADMIN }))).toBe(true);
    expect(managesBoard(input({ canViewAllTasks: true }))).toBe(true);
    expect(managesBoard(input())).toBe(false);
  });

  it('an assigned worker cannot cancel; a stranger is told it is not theirs', () => {
    const cancel = input({ status: TaskStatus.CANCELED });
    expect(() =>
      assertMayMoveStatus(task(), cancel, { isAssignedUser: true, hasManageAuthority: false }, logger),
    ).toThrow('You cannot cancel tasks assigned to you. Contact an administrator.');
    expect(() =>
      assertMayMoveStatus(task(), cancel, { isAssignedUser: false, hasManageAuthority: false }, logger),
    ).toThrow('You can only update status of tasks assigned to you');
  });

  it("cancelling another organization's task reads as missing", () => {
    const cancel = input({ status: TaskStatus.CANCELED, userRole: Role.ADMIN });
    expect(() =>
      assertMayMoveStatus(
        task({ organizationId: 'other' }),
        cancel,
        { isAssignedUser: false, hasManageAuthority: true },
        logger,
      ),
    ).toThrow(NotFoundException);
  });

  it('a non-assigned non-manager gets TASK_REASSIGNED', () => {
    try {
      assertMayMoveStatus(task(), input(), { isAssignedUser: false, hasManageAuthority: false }, logger);
      throw new Error('not refused');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect((e as ForbiddenException).getResponse()).toMatchObject({ code: 'TASK_REASSIGNED' });
    }
  });

  it('a foreign task moves only with a canCreateTasks grant in its space', () => {
    const foreign = task({ organizationId: 'other' });
    expect(() =>
      assertMayMoveStatus(
        foreign,
        input({ userRole: Role.ADMIN }),
        { isAssignedUser: false, hasManageAuthority: true },
        logger,
      ),
    ).toThrow('You can only update the status of tasks in your organization');
  });
});

describe('the due-date gate', () => {
  it('refuses setting off before the site day of the due date, allows on it', () => {
    const now = new Date('2026-10-17T10:00:00Z');
    expect(() => assertDueBySiteDay(task({ dueDate: new Date('2026-10-19T08:00:00Z') }), now)).toThrow(
      BadRequestException,
    );
    expect(() => assertDueBySiteDay(task({ dueDate: new Date('2026-10-17T20:00:00Z') }), now)).not.toThrow();
    expect(() => assertDueBySiteDay(task(), now)).not.toThrow();
  });
});

describe('what the move writes', () => {
  const at = new Date('2026-10-17T10:00:00Z');

  it('setting off starts a fresh route; arriving ends it', () => {
    expect(statusUpdateData(task(), null, TaskStatus.EN_ROUTE, at)).toEqual({
      status: TaskStatus.EN_ROUTE,
      routeStartedAt: at,
      routeDistance: 0,
      routeEndedAt: null,
    });
    expect(statusUpdateData(task(), null, TaskStatus.ARRIVED, at)).toEqual({
      status: TaskStatus.ARRIVED,
      routeEndedAt: at,
    });
  });

  it('any move ends a pause', () => {
    expect(statusUpdateData(task({ pausedAt: at }), null, TaskStatus.IN_PROGRESS, at)).toMatchObject({
      pausedAt: null,
      pausedById: null,
    });
  });

  it("a role task reaching the workflow's final step closes the role", () => {
    const wf = { statuses: [{ key: 'DONE_X', isFinal: true }] };
    expect(statusUpdateData(task({ openRoleId: 'r' }), wf, 'DONE_X', at)).toMatchObject({
      openSpotsLeft: 0,
      openWave: ROLE_WAVE_CLOSED,
    });
    expect(statusUpdateData(task({ openRoleId: 'r' }), wf, TaskStatus.IN_PROGRESS, at)).not.toHaveProperty('openWave');
  });
});
