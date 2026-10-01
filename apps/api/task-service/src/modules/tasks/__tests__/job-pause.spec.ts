/**
 * Paused at clock-out, and the handover note.
 *
 * A worker who clocked out with a job in work left it "running" with nobody on
 * it — its time counted overnight, and whoever got it next knew nothing of what
 * had been done.
 */
import { ForbiddenException } from '@nestjs/common';
import { TaskStatus, workedMinutesOnJob, cleanHandoverNote, HANDOVER_NOTE_MAX, type WorkTimelineEvent } from '@hbcfield/shared';
import { JobPauseService } from '../handover/job-pause.service';

const T = (hhmm: string) => new Date(`2026-10-01T${hhmm}:00Z`);
const working = (s: string) => ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(s);

describe('workedMinutesOnJob (shared)', () => {
  const ev = (at: string, userId: string, kind: WorkTimelineEvent['kind'], status?: string): WorkTimelineEvent => ({ at: T(at), userId, kind, status });

  it('counts time in working steps, not blocked time', () => {
    const events = [ev('08:00', 'mike', 'STATUS', 'ACCEPTED'), ev('09:00', 'mike', 'STATUS', 'IN_PROGRESS'), ev('10:00', 'mike', 'STATUS', 'BLOCKED'), ev('10:30', 'mike', 'STATUS', 'IN_PROGRESS')];
    expect(workedMinutesOnJob(events, 'mike', T('11:15'), working)).toBe(60 + 45);
  });

  it('stops at a pause and starts again at the resume', () => {
    const events = [ev('09:00', 'mike', 'STATUS', 'IN_PROGRESS'), ev('11:00', 'mike', 'PAUSED'), ev('13:00', 'mike', 'RESUMED')];
    expect(workedMinutesOnJob(events, 'mike', T('14:00'), working)).toBe(120 + 60);
  });

  it('credits somebody who joined later only from their own first move', () => {
    const events = [ev('08:00', 'mike', 'STATUS', 'IN_PROGRESS'), ev('11:00', 'mike', 'PAUSED'), ev('12:00', 'ali', 'RESUMED')];
    expect(workedMinutesOnJob(events, 'ali', T('13:30'), working)).toBe(90);
    expect(workedMinutesOnJob(events, 'nobody', T('13:30'), working)).toBe(0);
  });

  it('counts only time on the clock: a job left in progress overnight is not a night of work', () => {
    const events = [ev('08:00', 'mike', 'STATUS', 'IN_PROGRESS')];
    // In progress from 08:00 the day before until 11:15 today; on the clock 08:00–12:00 yesterday and 08:00 onwards today.
    const shifts = [
      { start: new Date('2026-09-30T08:00:00Z'), end: new Date('2026-09-30T12:00:00Z') },
      { start: T('08:00'), end: null },
    ];
    const yesterday = [{ at: new Date('2026-09-30T08:00:00Z'), userId: 'mike', kind: 'STATUS' as const, status: 'IN_PROGRESS' }];
    expect(workedMinutesOnJob(yesterday, 'mike', T('11:15'), working, shifts)).toBe(240 + 195);
    expect(workedMinutesOnJob(events, 'mike', T('11:15'), working, [])).toBe(0);
  });

  it('a note is trimmed and capped; empty is nothing written', () => {
    expect(cleanHandoverNote('  ')).toBeNull();
    expect(cleanHandoverNote(42)).toBeNull();
    expect(cleanHandoverNote('x'.repeat(HANDOVER_NOTE_MAX + 50))!.length).toBe(HANDOVER_NOTE_MAX);
  });
});

describe('JobPauseService', () => {
  const emit = jest.fn();
  let prisma: any;
  let service: JobPauseService;
  const job = (over: Record<string, unknown> = {}) => ({
    id: 't1', title: 'Boiler', status: TaskStatus.IN_PROGRESS, workflowId: null, spaceId: null,
    organizationId: 'o1', assignedToId: 'mike', pausedAt: null, ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      task: {
        findMany: jest.fn().mockResolvedValue([job()]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ id: 't1', title: 'Boiler', organizationId: 'o1', assignedToId: 'ali', pausedById: 'mike', handoverDueById: 'mike' }),
      },
      taskAssignee: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      // On the clock since 08:00 (the shifts the worked time is counted inside).
      timeEntry: { findMany: jest.fn().mockResolvedValue([{ clockInAt: T('08:00'), clockOutAt: null }]) },
      taskEvent: {
        findMany: jest.fn().mockResolvedValue([{ createdAt: T('09:00'), userId: 'mike', eventType: 'STATUS_CHANGED', metadata: { newStatus: 'IN_PROGRESS' } }]),
        findFirst: jest.fn().mockResolvedValue({ metadata: { workedMinutes: 135 } }),
        create: jest.fn(),
      },
      attachment: { findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]) },
      taskHandover: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }: any) => ({ ...data, id: data.id ?? 'h1', author: { firstName: 'Mike', lastName: 'Weber' } })),
      },
      spaceWorkflow: { findFirst: jest.fn().mockResolvedValue(null) },
      companyLocation: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const workflows: any = { getWorkflow: jest.fn().mockResolvedValue(null) };
    service = new JobPauseService(prisma, workflows, { emit } as any);
  });

  const clockOut = (over: Record<string, unknown> = {}) =>
    service.pauseAtClockOut({ userId: 'mike', organizationId: 'o1', at: T('11:15'), reason: 'CLOCK_OUT', ...over });

  it('pauses a job in work at the clock-out minute, flags "no handover yet", and records the time put in', async () => {
    await expect(clockOut()).resolves.toEqual({ paused: ['t1'] });
    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', pausedAt: null, status: TaskStatus.IN_PROGRESS },
      data: { pausedAt: T('11:15'), pausedById: 'mike', handoverDueById: 'mike' },
    });
    expect(prisma.taskEvent.create.mock.calls[0][0].data).toMatchObject({ eventType: 'PAUSED', metadata: { workedMinutes: 135, reason: 'CLOCK_OUT' } });
    expect(emit).toHaveBeenCalledWith('tasks_paused', expect.objectContaining({ taskIds: ['t1'] }));
  });

  it('a note written in the clock-out sheet owes nothing, and is kept', async () => {
    await clockOut({ handovers: [{ id: 'h-phone', taskId: 't1', note: 'Pump swapped, test run left' }] });
    expect(prisma.task.updateMany.mock.calls.find((c: any) => c[0].where.pausedAt === null)[0].data.handoverDueById).toBeNull();
    expect(prisma.taskHandover.create.mock.calls[0][0].data).toMatchObject({ id: 'h-phone', note: 'Pump swapped, test run left', authorId: 'mike' });
  });

  it('leaves alone a job that is not in a working step', async () => {
    prisma.task.findMany.mockResolvedValue([job({ status: TaskStatus.ACCEPTED }), job({ id: 't2', status: TaskStatus.BLOCKED })]);
    await expect(clockOut()).resolves.toEqual({ paused: [] });
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
  });

  it('keeps a crew job running while somebody else on it is still clocked in', async () => {
    prisma.task.findMany.mockResolvedValue([job({ assignedToId: 'ali' })]);
    prisma.timeEntry.findMany.mockResolvedValue([{ userId: 'ali' }]);
    await expect(clockOut()).resolves.toEqual({ paused: [] });
  });

  it('a real clock-out after the overnight guess moves the pause to the real minute', async () => {
    await clockOut({ since: T('07:00') });
    expect(prisma.task.updateMany.mock.calls[0][0]).toEqual({
      where: { organizationId: 'o1', pausedById: 'mike', pausedAt: { gte: T('07:00') } },
      data: { pausedAt: T('11:15') },
    });
  });

  it('never fails the clock-out', async () => {
    prisma.task.findMany.mockRejectedValue(new Error('db down'));
    await expect(clockOut()).resolves.toEqual({ paused: [] });
  });

  describe('addHandover', () => {
    const write = (over: Record<string, unknown> = {}) =>
      service.addHandover({ taskId: 't1', note: 'Did the pump', userId: 'mike', organizationId: 'o1', ...over });

    it('the person who owes it writes it after being taken off the job; the new assignee hears it', async () => {
      await write({ attachmentIds: ['a1', 'someone-elses'] });
      expect(prisma.taskHandover.create.mock.calls[0][0].data).toMatchObject({ attachmentIds: ['a1'], workedMinutes: 135 });
      expect(prisma.attachment.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['a1', 'someone-elses'] }, taskId: 't1' });
      expect(prisma.task.updateMany).toHaveBeenCalledWith({ where: { id: 't1', handoverDueById: 'mike' }, data: { handoverDueById: null } });
      expect(emit).toHaveBeenCalledWith('task_handover_added', expect.objectContaining({ recipientIds: ['ali'] }));
    });

    it('nobody off the job writes one', async () => {
      const err = await write({ userId: 'stranger' }).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.getResponse()).toMatchObject({ code: 'HANDOVER_NOT_ON_THE_JOB' });
    });

    it("another organization's job is not there", async () => {
      await expect(write({ organizationId: 'o2' })).rejects.toThrow('Task not found');
    });

    it('a resend of the same note is answered once', async () => {
      prisma.taskHandover.findUnique.mockResolvedValue({ id: 'h1', taskId: 't1', authorId: 'mike' });
      await write({ id: 'h1' });
      expect(prisma.taskHandover.create).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });
  });
});
