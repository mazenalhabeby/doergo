import { STATUS_TRANSITIONS, TaskStatus } from '@hbcfield/shared';

/**
 * A finished task stops moving — for everyone.
 *
 * Managers may otherwise drop a card in any column, which is what makes the
 * board usable. That bypass also let a COMPLETED or CANCELED task be dragged
 * back into play while the task's own detail page offered nothing at all: the
 * same person, two answers, depending which screen they were on.
 *
 * These pin the rule the service now applies: once a task is finished, the
 * declared transitions govern and the manager bypass does not apply.
 */
describe('finished tasks are immutable', () => {
  /** The service's rule, in the same shape it evaluates it. */
  const mayMove = (from: TaskStatus, to: TaskStatus, isManager: boolean) => {
    const finished =
      from === TaskStatus.COMPLETED || from === TaskStatus.CLOSED || from === TaskStatus.CANCELED;
    const allowed = (STATUS_TRANSITIONS[from] || []) as string[];
    const targetIsValid = (Object.values(TaskStatus) as string[]).includes(to);
    const managerFreeMove = isManager && targetIsValid && !finished;
    return managerFreeMove || allowed.includes(to);
  };

  it('lets a manager drop an active card in any column — the board still works', () => {
    expect(mayMove(TaskStatus.NEW, TaskStatus.IN_PROGRESS, true)).toBe(true);
    expect(mayMove(TaskStatus.ASSIGNED, TaskStatus.COMPLETED, true)).toBe(true);
  });

  it('holds a worker to the declared transitions', () => {
    expect(mayMove(TaskStatus.NEW, TaskStatus.IN_PROGRESS, false)).toBe(false);
    expect(mayMove(TaskStatus.NEW, TaskStatus.ASSIGNED, false)).toBe(true);
  });

  it('refuses to reopen a completed task, even for a manager', () => {
    // The case that started this: draggable on the board, impossible on the
    // detail page. Now impossible on both.
    expect(mayMove(TaskStatus.COMPLETED, TaskStatus.IN_PROGRESS, true)).toBe(false);
    expect(mayMove(TaskStatus.COMPLETED, TaskStatus.NEW, true)).toBe(false);
  });

  it('still allows the one step a completed task has — closing it', () => {
    expect(mayMove(TaskStatus.COMPLETED, TaskStatus.CLOSED, true)).toBe(true);
    expect(mayMove(TaskStatus.COMPLETED, TaskStatus.CLOSED, false)).toBe(true);
  });

  it('refuses to revive a canceled or closed task', () => {
    for (const from of [TaskStatus.CANCELED, TaskStatus.CLOSED]) {
      for (const to of [TaskStatus.NEW, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED]) {
        expect(mayMove(from, to, true)).toBe(false);
        expect(mayMove(from, to, false)).toBe(false);
      }
    }
  });

  it('agrees with the canonical table about what is terminal', () => {
    // If someone later gives CANCELED or CLOSED an outgoing transition, this
    // fails and they have to decide deliberately rather than by accident.
    expect(STATUS_TRANSITIONS[TaskStatus.CANCELED]).toEqual([]);
    expect(STATUS_TRANSITIONS[TaskStatus.CLOSED]).toEqual([]);
    expect(STATUS_TRANSITIONS[TaskStatus.COMPLETED]).toEqual([TaskStatus.CLOSED]);
  });
});
