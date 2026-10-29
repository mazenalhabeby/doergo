/**
 * CrewService — the server is the boundary: on the crew, joined, the leader,
 * the new leader on THIS crew. Every rule here is one a screen also shows, and
 * none of them may live only on the screen.
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CREW_CODES } from '@hbcfield/shared';
import { CrewService } from '../handover/crew.service';
import { CrewReader } from '../handover/crew-reader.service';
import { CrewPresenceService } from '../handover/crew-presence.service';
import { CrewLeadService } from '../handover/crew-lead.service';
import { JobTimeService } from '../handover/job-time.service';
import { TaskAccessService } from '../access/task-access.service';

const T = (hhmm: string) => new Date(`2026-10-01T${hhmm}:00Z`);
const ORG = 'org1';

const baseTask = (over: Record<string, unknown> = {}) => ({
  id: 'job1', title: 'Install rooftop AC', status: 'IN_PROGRESS', organizationId: ORG, spaceId: 'sp1', workflowId: null,
  assignedToId: 'tobias', pausedAt: null, leadOverrideId: null, leadOverrideUntil: null, ...over,
});

function setup(opts: { task?: Record<string, unknown>; events?: any[]; onClock?: string[]; crewMode?: boolean; external?: string[] } = {}) {
  const task = baseTask(opts.task);
  const events = opts.events ?? [
    { taskId: 'job1', createdAt: T('07:30'), userId: 'tobias', eventType: 'STATUS_CHANGED', metadata: { newStatus: 'EN_ROUTE', occurredAt: T('07:30').toISOString() } },
    { taskId: 'job1', createdAt: T('08:00'), userId: 'tobias', eventType: 'STATUS_CHANGED', metadata: { newStatus: 'IN_PROGRESS', occurredAt: T('08:00').toISOString() } },
  ];
  const onClock = new Set(opts.onClock ?? ['tobias', 'priya', 'conor']);
  const prisma: any = {
    task: {
      findUnique: jest.fn().mockImplementation(async () => task),
      update: jest.fn().mockImplementation(async ({ data }: any) => Object.assign(task, data)),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    taskAssignee: {
      findMany: jest.fn().mockResolvedValue([
        { userId: 'tobias', role: 'LEAD' }, { userId: 'priya', role: 'MEMBER' }, { userId: 'conor', role: 'MEMBER' },
      ]),
      updateMany: jest.fn().mockReturnValue('demote'),
      upsert: jest.fn().mockReturnValue('promote'),
      // The task gate's co-assignee lookup (TaskAccessService).
      findFirst: jest.fn().mockImplementation(async ({ where }: any) =>
        ['tobias', 'priya', 'conor'].includes(where.userId) ? { id: `a-${where.userId}` } : null),
    },
    taskEvent: {
      findMany: jest.fn().mockImplementation(async ({ where }: any) => (where?.eventType === 'SELF_BLOCKED' ? [] : events)),
      create: jest.fn().mockImplementation(async ({ data }: any) => { events.push({ ...data, createdAt: new Date() }); return data; }),
      createMany: jest.fn(),
    },
    timeEntry: {
      findMany: jest.fn().mockImplementation(async ({ where }: any) =>
        (where.userId?.in ?? []).filter((id: string) => onClock.has(id)).map((id: string) => ({ userId: id, clockInAt: T('07:00') }))),
    },
    user: {
      findUnique: jest.fn().mockImplementation(async ({ where }: any) => ({
        id: where.id, firstName: where.id, lastName: '', organizationId: ORG, isActive: true, isExternal: (opts.external ?? []).includes(where.id),
      })),
      findMany: jest.fn().mockImplementation(async ({ where }: any) => (where.id.in as string[]).map((id) => ({ id, firstName: id, lastName: '', avatarUrl: null }))),
    },
    organization: { findUnique: jest.fn().mockResolvedValue({ crewMode: !!opts.crewMode, timezone: 'America/Los_Angeles' }) },
    companyLocation: { findUnique: jest.fn().mockResolvedValue({ timezone: 'America/Los_Angeles' }) },
    spaceWorkflow: { findFirst: jest.fn().mockResolvedValue(null) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  // Interactive transactions run on the same mock; the row lock is recorded.
  prisma.$transaction = jest.fn(async (fn: any) => (typeof fn === 'function' ? fn(prisma) : fn));
  const workflows: any = { getWorkflow: jest.fn().mockResolvedValue(null) };
  const clockGate: any = { assertWorkerClockedIn: jest.fn().mockResolvedValue({ userId: 'x', clockInAt: T('07:00') }) };
  const jobPause: any = { workingJobsOf: jest.fn().mockResolvedValue([]), pauseOnLeave: jest.fn().mockResolvedValue(true) };
  const emit = jest.fn();
  const jobTime = new JobTimeService(prisma, workflows);
  const notifications = { emit } as any;
  const reader = new CrewReader(prisma, workflows, jobTime, new TaskAccessService(prisma));
  const presence = new CrewPresenceService(prisma, reader, jobTime, jobPause, clockGate, notifications);
  const lead = new CrewLeadService(prisma, reader, jobTime, notifications);
  const service = new CrewService(prisma, reader, presence, lead, jobTime, notifications);
  return { service, prisma, events, clockGate, jobPause, emit, task };
}

const actor = (userId: string, over: Record<string, unknown> = {}) => ({ userId, userRole: 'EMPLOYEE', organizationId: ORG, ...over });
const created = (prisma: any, type: string) => prisma.taskEvent.create.mock.calls.map((c: any) => c[0].data).filter((d: any) => d.eventType === type);

describe('CrewService.join', () => {
  it('"I\'m with him" within 30 minutes counts from the leader\'s start', async () => {
    const { service, prisma } = setup();
    await service.join({ ...actor('priya'), taskId: 'job1', viaLeaderStart: true, evidence: { occurredAt: T('07:45').toISOString() } as any });
    const [joined] = created(prisma, 'CREW_JOINED');
    expect(joined).toMatchObject({ userId: 'priya', metadata: { at: T('07:30').toISOString(), viaLeaderAt: T('07:30').toISOString() } });
  });

  it('a job the caller cannot SEE is a 404 — never "they are not on this job"', async () => {
    const { service } = setup();
    // A 400 NOT_ON_CREW here confirmed the job exists to somebody who cannot open it.
    await expect(service.join({ ...actor('stranger'), taskId: 'job1' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.leave({ ...actor('stranger'), taskId: 'job1' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.selfIssue({ ...actor('stranger'), taskId: 'job1', reason: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.view('job1', actor('stranger'))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('somebody who CAN see the job but is not on its crew gets the rule they can act on', async () => {
    const { service } = setup();
    await expect(service.join({ ...actor('viewer', { canViewAllTasks: true }), taskId: 'job1' }))
      .rejects.toMatchObject({ response: { code: CREW_CODES.NOT_ON_CREW } });
    await expect(service.join({ ...actor('sitelead', { viewAllSpaceIds: ['sp1'] }), taskId: 'job1' }))
      .rejects.toMatchObject({ response: { code: CREW_CODES.NOT_ON_CREW } });
  });

  it('an external member cannot join, even on the crew', async () => {
    const { service } = setup({ external: ['conor'] });
    await expect(service.join({ ...actor('conor'), taskId: 'job1' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a job of another organization is a 404, never a hint it exists', async () => {
    const { service } = setup({ task: { organizationId: 'other' } });
    await expect(service.join({ ...actor('priya'), taskId: 'job1' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a member cannot join somebody else — only the office, with a reason', async () => {
    const { service } = setup();
    await expect(service.join({ ...actor('priya'), taskId: 'job1', forUserId: 'conor' })).rejects.toBeInstanceOf(NotFoundException);
    const office = setup();
    // "View all" is not enough to put somebody on a job: that is a decision about who works it.
    await expect(office.service.join({ ...actor('viewer', { canViewAllTasks: true }), taskId: 'job1', forUserId: 'conor', reason: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(office.service.join({ ...actor('anna', { canAssignTasks: true }), taskId: 'job1', forUserId: 'conor' })).rejects.toMatchObject({ response: { code: 'OFFICE_START_REASON_REQUIRED' } });
    await office.service.join({ ...actor('anna', { canAssignTasks: true }), taskId: 'job1', forUserId: 'conor', reason: 'He is on site, phone flat' });
    expect(created(office.prisma, 'CREW_JOINED')[0]).toMatchObject({ userId: 'conor', metadata: { byUserId: 'anna', reason: 'He is on site, phone flat' } });
  });

  it('asks the clock gate — joining is a way onto a job', async () => {
    const { service, clockGate } = setup();
    clockGate.assertWorkerClockedIn.mockRejectedValue(new BadRequestException({ code: 'NOT_CLOCKED_IN' }));
    await expect(service.join({ ...actor('priya'), taskId: 'job1' })).rejects.toMatchObject({ response: { code: 'NOT_CLOCKED_IN' } });
  });

  it('a paused job is picked up with Resume, not joined', async () => {
    const { service } = setup({ task: { pausedAt: T('12:00') } });
    await expect(service.join({ ...actor('priya'), taskId: 'job1' })).rejects.toMatchObject({ response: { code: CREW_CODES.JOB_NOT_STARTED } });
  });

  it('a tap cannot be back-dated before the job was under way, and odd evidence is kept', async () => {
    const { service, prisma } = setup();
    // The job started at 07:30; a tap claiming 07:05 joins at 07:30, never earlier.
    await service.join({ ...actor('priya'), taskId: 'job1', evidence: { occurredAt: T('07:05').toISOString(), fix: { lat: 1, lng: 2, accuracy: 9, fixAt: T('07:05').toISOString() } } as any });
    const [joined] = created(prisma, 'CREW_JOINED');
    expect(joined.metadata.at).toBe(T('07:30').toISOString());
    expect(joined.metadata.fix).toEqual({ lat: 1, lng: 2, accuracy: 9 });
  });

  it('a join cannot reopen time after their own leave', async () => {
    const s = setup();
    s.events.push(
      { taskId: 'job1', createdAt: T('08:10'), userId: 'priya', eventType: 'CREW_JOINED', metadata: { at: T('08:10').toISOString() } },
      { taskId: 'job1', createdAt: T('10:00'), userId: 'priya', eventType: 'CREW_LEFT', metadata: { at: T('10:00').toISOString(), why: 'SELF' } },
    );
    await s.service.join({ ...actor('priya'), taskId: 'job1', evidence: { occurredAt: T('09:00').toISOString() } as any });
    expect(created(s.prisma, 'CREW_JOINED')[0].metadata.at).toBe(T('10:00').toISOString());
  });

  it('is idempotent while joined', async () => {
    const { service, prisma } = setup();
    await service.join({ ...actor('priya'), taskId: 'job1' });
    await service.join({ ...actor('priya'), taskId: 'job1' });
    expect(created(prisma, 'CREW_JOINED')).toHaveLength(1);
  });
});

describe('CrewService.leave', () => {
  it('the last joined member on the clock leaving pauses the job', async () => {
    const { service, jobPause } = setup({ onClock: ['tobias'] });
    await service.leave({ ...actor('tobias'), taskId: 'job1' });
    expect(jobPause.pauseOnLeave).toHaveBeenCalledWith('job1', 'tobias', ORG, expect.any(Date));
  });

  it('leaving while somebody joined is still on the clock keeps it running', async () => {
    const s = setup();
    s.events.push({ taskId: 'job1', createdAt: T('07:40'), userId: 'priya', eventType: 'CREW_JOINED', metadata: { at: T('07:40').toISOString() } });
    await s.service.leave({ ...actor('tobias'), taskId: 'job1' });
    expect(s.jobPause.pauseOnLeave).not.toHaveBeenCalled();
    expect(created(s.prisma, 'CREW_LEFT')[0]).toMatchObject({ userId: 'tobias', metadata: { why: 'SELF' } });
  });
});

describe('CrewService.selfIssue / selfResume', () => {
  it('needs a reason, and to be on the job', async () => {
    const { service } = setup();
    await expect(service.selfIssue({ ...actor('tobias'), taskId: 'job1', reason: '  ' })).rejects.toMatchObject({ response: { code: 'REASON_REQUIRED' } });
    await expect(service.selfIssue({ ...actor('conor'), taskId: 'job1', reason: 'Part missing' })).rejects.toMatchObject({ response: { code: CREW_CODES.NOT_JOINED } });
  });

  it('stops only them, and tells the leader why', async () => {
    const s = setup();
    s.events.push({ taskId: 'job1', createdAt: T('07:40'), userId: 'priya', eventType: 'CREW_JOINED', metadata: { at: T('07:40').toISOString() } });
    await s.service.selfIssue({ ...actor('priya'), taskId: 'job1', reason: 'Waiting for the flange kit' });
    expect(created(s.prisma, 'SELF_BLOCKED')[0]).toMatchObject({ userId: 'priya', metadata: { reason: 'Waiting for the flange kit' } });
    expect(s.emit).toHaveBeenCalledWith('task_crew_issue', expect.objectContaining({ leaderId: 'tobias', reason: 'Waiting for the flange kit' }));
    // The job's own step is untouched.
    expect(s.prisma.task.update).not.toHaveBeenCalled();
  });

  it('resuming asks the clock gate (it is work again)', async () => {
    const s = setup();
    s.events.push(
      { taskId: 'job1', createdAt: T('07:40'), userId: 'priya', eventType: 'CREW_JOINED', metadata: { at: T('07:40').toISOString() } },
      { taskId: 'job1', createdAt: T('13:00'), userId: 'priya', eventType: 'SELF_BLOCKED', metadata: { at: T('13:00').toISOString(), reason: 'x' } },
    );
    await s.service.selfResume({ ...actor('priya'), taskId: 'job1' });
    expect(s.clockGate.assertWorkerClockedIn).toHaveBeenCalled();
    expect(created(s.prisma, 'SELF_RESUMED')).toHaveLength(1);
  });
});

describe('CrewService.changeLead — this job only', () => {
  it('the leader hands it over for today: until the end of the day where the work is', async () => {
    const s = setup();
    await s.service.changeLead({ ...actor('tobias'), taskId: 'job1', toUserId: 'priya', scope: 'TODAY' });
    const data = s.prisma.task.update.mock.calls[0][0].data;
    expect(data.leadOverrideId).toBe('priya');
    expect(data.leadOverrideUntil.getUTCHours()).toBe(6); // 23:59:59 PDT
    expect(created(s.prisma, 'LEAD_CHANGED')[0]).toMatchObject({ metadata: { from: 'tobias', to: 'priya', scope: 'TODAY', by: 'LEADER' } });
    expect(s.emit).toHaveBeenCalledWith('task_lead_changed', expect.objectContaining({ toUserId: 'priya', scope: 'TODAY' }));
  });

  it('for good: the LEAD row and the assignee move, the same shape the assign path writes', async () => {
    const s = setup();
    await s.service.changeLead({ ...actor('tobias'), taskId: 'job1', toUserId: 'priya', scope: 'PERMANENT' });
    expect(s.prisma.$transaction).toHaveBeenCalled();
    expect(s.prisma.taskAssignee.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { taskId: 'job1', userId: 'priya', role: 'LEAD' } }));
  });

  it('an acting leader hands over for today only — never takes the job from the absent leader for good', async () => {
    const s = setup({ onClock: ['priya', 'conor'] });
    s.events.push({ taskId: 'job1', createdAt: T('07:40'), userId: 'conor', eventType: 'CREW_JOINED', metadata: { at: T('07:40').toISOString() } });
    await expect(s.service.changeLead({ ...actor('conor'), taskId: 'job1', toUserId: 'conor', scope: 'PERMANENT' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a stand-in for TODAY cannot make themselves the lead for good', async () => {
    const s = setup({ task: { leadOverrideId: 'priya', leadOverrideUntil: new Date(Date.now() + 3_600_000) } });
    await expect(s.service.changeLead({ ...actor('priya'), taskId: 'job1', toUserId: 'priya', scope: 'PERMANENT' }))
      .rejects.toMatchObject({ response: { code: CREW_CODES.LEAD_NOT_YOURS } });
    expect(s.prisma.taskAssignee.upsert).not.toHaveBeenCalled();
    // For today, they still may pass it on.
    await s.service.changeLead({ ...actor('priya'), taskId: 'job1', toUserId: 'conor', scope: 'TODAY' });
    // The office still may make them lead for good.
    await s.service.changeLead({ ...actor('anna', { canAssignTasks: true }), taskId: 'job1', toUserId: 'priya', scope: 'PERMANENT' });
    expect(s.prisma.taskAssignee.upsert).toHaveBeenCalled();
  });

  it('two hand-overs at once: the job row is locked first', async () => {
    const s = setup();
    await s.service.changeLead({ ...actor('tobias'), taskId: 'job1', toUserId: 'priya', scope: 'PERMANENT' });
    expect(s.prisma.$queryRaw).toHaveBeenCalled();
  });

  it('a member who is not the leader cannot', async () => {
    const s = setup();
    await expect(s.service.changeLead({ ...actor('conor'), taskId: 'job1', toUserId: 'conor', scope: 'TODAY' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a stranger learns nothing', async () => {
    const s = setup();
    await expect(s.service.changeLead({ ...actor('stranger'), taskId: 'job1', toUserId: 'priya', scope: 'TODAY' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('never hands it to somebody off this crew — not even the office can add people here', async () => {
    const s = setup();
    await expect(s.service.changeLead({ ...actor('anna', { canAssignTasks: true }), taskId: 'job1', toUserId: 'outsider', scope: 'TODAY' }))
      .rejects.toMatchObject({ response: { code: CREW_CODES.LEAD_TARGET_NOT_ON_CREW } });
  });

  it('the office may, with assign rights in the job\'s workspace only', async () => {
    const s = setup();
    await s.service.changeLead({ ...actor('anna', { access: { org: {}, perSpace: { sp1: { canAssignTasks: true } } } }), taskId: 'job1', toUserId: 'conor', scope: 'TODAY' });
    expect(created(s.prisma, 'LEAD_CHANGED')[0]).toMatchObject({ metadata: { by: 'OFFICE' } });
    const other = setup();
    await expect(other.service.changeLead({ ...actor('anna', { access: { org: {}, perSpace: { sp9: { canAssignTasks: true } } } }), taskId: 'job1', toUserId: 'conor', scope: 'TODAY' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('an absent leader: the acting leader may hand it over', async () => {
    const s = setup({ onClock: ['priya', 'conor'] });
    s.events.push({ taskId: 'job1', createdAt: T('07:40'), userId: 'conor', eventType: 'CREW_JOINED', metadata: { at: T('07:40').toISOString() } });
    // Tobias is off: Tobias's own moves opened him, but he is not on the clock; Conor stands in.
    await s.service.changeLead({ ...actor('conor'), taskId: 'job1', toUserId: 'priya', scope: 'TODAY' });
    expect(created(s.prisma, 'LEAD_CHANGED')[0]).toMatchObject({ metadata: { by: 'LEADER' } });
  });
});

describe('a sick leader never stops a job from starting', () => {
  it('with nobody joined yet, the first crew member on the clock stands in', async () => {
    const s = setup({ crewMode: true, onClock: ['priya', 'conor'], task: { status: 'ACCEPTED' }, events: [] });
    await expect(s.service.assertMayMoveStep(s.task as any, actor('priya'))).resolves.toBeUndefined();
    await expect(s.service.assertMayMoveStep(s.task as any, actor('conor'))).rejects.toMatchObject({ response: { code: CREW_CODES.LEADER_MOVES_STEPS } });
  });

  it("today's lead ends with their place on the crew", async () => {
    const s = setup({ crewMode: true, task: { leadOverrideId: 'gone', leadOverrideUntil: new Date(Date.now() + 3_600_000) } });
    await expect(s.service.assertMayMoveStep(s.task as any, actor('tobias'))).resolves.toBeUndefined();
  });
});

describe('CrewService.assertMayMoveStep — crew mode', () => {
  it('off: anybody on the crew, as before', async () => {
    const s = setup({ crewMode: false });
    await expect(s.service.assertMayMoveStep(s.task as any, actor('conor'))).resolves.toBeUndefined();
  });

  it('on: only the leader; the refusal names them', async () => {
    const s = setup({ crewMode: true });
    await expect(s.service.assertMayMoveStep(s.task as any, actor('conor'))).rejects.toMatchObject({ response: { code: CREW_CODES.LEADER_MOVES_STEPS, params: { name: 'tobias' } } });
    await expect(s.service.assertMayMoveStep(s.task as any, actor('tobias'))).resolves.toBeUndefined();
    await expect(s.service.assertMayMoveStep(s.task as any, actor('anna', { canAssignTasks: true }))).resolves.toBeUndefined();
  });

  it('on: "view all tasks" on the crew is one more member — moving past the leader takes "assign tasks"', async () => {
    const s = setup({ crewMode: true });
    await expect(s.service.assertMayMoveStep(s.task as any, actor('conor', { canViewAllTasks: true })))
      .rejects.toMatchObject({ response: { code: CREW_CODES.LEADER_MOVES_STEPS } });
    await expect(s.service.assertMayMoveStep(s.task as any, actor('conor', { viewAllSpaceIds: ['sp1'] })))
      .rejects.toMatchObject({ response: { code: CREW_CODES.LEADER_MOVES_STEPS } });
    const here = { org: {}, perSpace: { sp1: { canAssignTasks: true } } };
    await expect(s.service.assertMayMoveStep(s.task as any, actor('conor', { access: here }))).resolves.toBeUndefined();
    const elsewhere = { org: {}, perSpace: { sp9: { canAssignTasks: true } } };
    await expect(s.service.assertMayMoveStep(s.task as any, actor('conor', { access: elsewhere })))
      .rejects.toMatchObject({ response: { code: CREW_CODES.LEADER_MOVES_STEPS } });
  });
});

describe('CrewService.announceStart', () => {
  it('asks only crew members on the clock who have not joined', async () => {
    const s = setup({ onClock: ['tobias', 'priya'] });
    await s.service.announceStart('job1', 'tobias', T('07:30'));
    expect(s.emit).toHaveBeenCalledWith('task_crew_started', expect.objectContaining({ memberIds: ['priya'], startedAt: T('07:30').toISOString() }));
  });
});

describe('CrewService.view', () => {
  it('who is on the job and who leads', async () => {
    const s = setup({ onClock: ['priya', 'conor'] });
    s.events.push({ taskId: 'job1', createdAt: T('07:40'), userId: 'priya', eventType: 'CREW_JOINED', metadata: { at: T('07:40').toISOString() } });
    const v = (await s.service.view('job1', actor('priya'))).data as any;
    expect(v.leader).toEqual({ userId: 'priya', acting: true, source: 'ACTING' });
    expect(v.members.find((m: any) => m.user.id === 'priya')).toMatchObject({ joined: true, onClock: true });
    expect(v.members.find((m: any) => m.user.id === 'conor')).toMatchObject({ joined: false });
  });
});

describe('the acting stand-in is the same on every read', () => {
  it('the crew is read in the order it was put on, then by id', async () => {
    const s = setup();
    await s.service.view('job1', actor('priya'));
    expect(s.prisma.taskAssignee.findMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
  });

  it('two joined at the same moment: the stand-in is picked by id, not by the order the rows came back', async () => {
    const at = T('07:40').toISOString();
    const joins = (first: string, second: string) => [
      { taskId: 'job1', createdAt: T('07:40'), userId: first, eventType: 'CREW_JOINED', metadata: { at } },
      { taskId: 'job1', createdAt: T('07:40'), userId: second, eventType: 'CREW_JOINED', metadata: { at } },
    ];
    const a = setup({ onClock: ['priya', 'conor'], events: joins('priya', 'conor') });
    const b = setup({ onClock: ['priya', 'conor'], events: joins('conor', 'priya') });
    const leadA = ((await a.service.view('job1', actor('priya'))).data as any).leader.userId;
    const leadB = ((await b.service.view('job1', actor('priya'))).data as any).leader.userId;
    expect(leadA).toBe('conor');
    expect(leadB).toBe('conor');
  });
});

describe('CrewService.checklistAuthority — who may give a checklist item away', () => {
  it('the leader, read from the job\'s own history', async () => {
    const { service } = setup();
    await expect(service.checklistAuthority('job1', actor('priya'))).resolves.toMatchObject({ isOffice: false, leaderId: 'tobias', crewIds: ['tobias', 'priya', 'conor'] });
  });

  it('a stand-in leads when the leader is off the clock', async () => {
    const { service } = setup({
      onClock: ['priya', 'conor'],
      events: [{ taskId: 'job1', createdAt: T('08:00'), userId: 'priya', eventType: 'CREW_JOINED', metadata: { at: T('08:00').toISOString() } }],
    });
    await expect(service.checklistAuthority('job1', actor('conor'))).resolves.toMatchObject({ leaderId: 'priya' });
  });

  it('"assign tasks" in THIS job\'s workspace is the office; in another workspace it is not', async () => {
    const here = { perSpace: { sp1: { canAssignTasks: true } } };
    const elsewhere = { perSpace: { sp9: { canAssignTasks: true } } };
    const { service } = setup();
    await expect(service.checklistAuthority('job1', actor('mara', { access: here }))).resolves.toMatchObject({ isOffice: true });
    await expect(service.checklistAuthority('job1', actor('priya', { access: elsewhere }))).resolves.toMatchObject({ isOffice: false });
  });

  it('the office skips the leader lookup — one crew read, no history read', async () => {
    const { service, prisma } = setup();
    await service.checklistAuthority('job1', actor('mara', { canAssignTasks: true }));
    expect(prisma.taskEvent.findMany).not.toHaveBeenCalled();
  });

  it('another organization\'s job is not found', async () => {
    const { service } = setup({ task: { organizationId: 'other' } });
    await expect(service.checklistAuthority('job1', actor('priya'))).rejects.toBeInstanceOf(NotFoundException);
  });
});
