/**
 * Moving a job into a step that ASKS something (a step form).
 *
 * The server never trusts the phone's own check: it re-validates the answers
 * against the step's definition, checks every photo and signature belongs to
 * this job, and writes the move and the answers in ONE transaction — a refused
 * form leaves the job where it was.
 */
import { Test } from '@nestjs/testing';
import { TaskAccessService } from '../../../common/task-access/task-access.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { OBJECT_STORE } from '@hbcfield/shared/storage';
import { Role, STEP_FORM_PRESETS } from '@hbcfield/shared';
import { TasksService } from '../tasks.service';
import { TASK_SERVICE_PARTS } from '../task-service-parts';
import { RolePoolService } from '../role-pool.service';
import { PrismaService } from '@hbcfield/shared';
import { WorkflowConfigCache } from '../../../common/cache/workflow-config-cache.service';
import { NotificationRoutingService } from '../../../common/notification-routing.service';
import { MediaSigner } from '../../../common/storage/media-signer.service';
import { JobTimeService } from '../handover/job-time.service';
import { PresenceService } from '../../attendance/presence/presence.service';
import { ClockGateService } from '../handover/clock-gate.service';
import { CrewService } from '../handover/crew.service';

/** The crew rules are their own service (crew.spec.ts); here they say nothing. */
const crewStub = () => ({
  joinAs: jest.fn().mockResolvedValue(null),
  assertMayMoveStep: jest.fn().mockResolvedValue(undefined),
  leaveOtherJobs: jest.fn().mockResolvedValue(undefined),
  announceStart: jest.fn().mockResolvedValue(undefined),
  viewFor: jest.fn().mockResolvedValue(null),
});

const VISIT_FORM = {
  version: 3,
  fields: [
    { id: 'outcome', type: 'choice', label: 'Outcome', required: true, options: ['Won', 'Lost'], crm: 'outcome' },
    { id: 'notes', type: 'note', label: 'Notes', required: false },
    { id: 'pics', type: 'photos', label: 'Photos', required: false },
    { id: 'sig', type: 'signature', label: 'Signature', required: false },
    { id: 'next', type: 'date', label: 'Follow up on', required: false, crm: 'followUp' },
  ],
};

const WORKFLOW = {
  id: 'wf1',
  name: 'Custom',
  statuses: [
    { key: 'WORKING', name: 'Working', isFinal: false, isCanceled: false, transitions: ['VISITED', 'COMPLETED', 'PAUSED'], capabilities: [], form: null },
    { key: 'VISITED', name: 'Visited', isFinal: false, isCanceled: false, transitions: [], capabilities: [], form: VISIT_FORM },
    { key: 'PAUSED', name: 'Paused', isFinal: false, isCanceled: false, transitions: ['WORKING'], capabilities: ['timer'], form: null },
    { key: 'COMPLETED', name: 'Completed', isFinal: true, isCanceled: false, transitions: [], capabilities: ['report', 'photos', 'signature'], form: null },
  ],
};

function base(over: Record<string, unknown> = {}) {
  return {
    id: 't1', title: 'Visit Siemens', status: 'WORKING', organizationId: 'o1', assignedToId: 'tech',
    createdById: 'boss', spaceId: 's1', workflowId: 'wf1', dueDate: null, customerId: null,
    locationLat: null, locationLng: null, updatedAt: new Date(), space: { timezone: 'Europe/Vienna' },
    ...over,
  };
}

describe('status change into a step with a form', () => {
  let service: TasksService;
  let auth: { send: jest.Mock };
  const tx: any = {
    task: { updateMany: jest.fn() },
    taskStepSubmission: { create: jest.fn() },
  };
  const prisma: any = {
    task: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
    taskAssignee: { findFirst: jest.fn().mockResolvedValue(null) },
    taskEvent: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    attachment: { findMany: jest.fn() },
    companyLocation: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn() },
    organization: { findUnique: jest.fn() },
    spaceAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  const workflowCache = { getWorkflow: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    workflowCache.getWorkflow.mockResolvedValue(WORKFLOW);
    prisma.task.updateMany.mockResolvedValue({ count: 1 });
    tx.task.updateMany.mockResolvedValue({ count: 1 });
    tx.taskStepSubmission.create.mockResolvedValue({ id: 'sub_0000000000000001' });
    prisma.task.findUniqueOrThrow.mockImplementation(async () => base({ status: 'VISITED' }));
    prisma.attachment.findMany.mockResolvedValue([]);
    prisma.companyLocation.findFirst.mockResolvedValue({ enabledModules: ['crm'], organization: { enabledModules: [] } });
    auth = { send: jest.fn(() => of({ data: { id: 'act' } })) };
    const module = await Test.createTestingModule({
      providers: [
        TasksService, ...TASK_SERVICE_PARTS, TaskAccessService,
        { provide: JobTimeService, useValue: {} }, ClockGateService, { provide: CrewService, useValue: crewStub() }, { provide: RolePoolService, useValue: { holdsOpenRole: jest.fn().mockResolvedValue(false), syncSpots: jest.fn().mockResolvedValue(undefined) } }, { provide: PresenceService, useValue: { onJobMoved: jest.fn().mockResolvedValue(undefined) } },
        { provide: PrismaService, useValue: prisma },
        { provide: 'NOTIFICATION_SERVICE', useValue: { emit: jest.fn() } },
        { provide: 'AUTH_SERVICE', useValue: auth },
        { provide: ConfigService, useValue: { get: (_k: string, d: unknown) => d } },
        { provide: WorkflowConfigCache, useValue: workflowCache },
        { provide: NotificationRoutingService, useValue: { resolveWatchers: jest.fn().mockResolvedValue({ ids: [] }) } },
        MediaSigner,
        { provide: OBJECT_STORE, useValue: null },
      ],
    }).compile();
    service = module.get(TasksService);
  });

  const tech = { id: 't1', userId: 'tech', userRole: Role.EMPLOYEE, organizationId: 'o1' };
  const boss = { id: 't1', userId: 'boss', userRole: Role.ADMIN, organizationId: 'o1' };
  const refusal = async (p: Promise<unknown>) => {
    const err: any = await p.catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    return err.getResponse();
  };

  it('writes the move AND the submission in one transaction, snapshotting the form and its version', async () => {
    prisma.task.findUnique.mockResolvedValue(base());
    prisma.attachment.findMany.mockResolvedValue([
      { id: 'p1', mimeType: 'image/jpeg', fileType: 'IMAGE' },
      { id: 's1', mimeType: 'image/png', fileType: 'IMAGE' },
    ]);
    const res: any = await service.updateStatus({
      ...tech, status: 'VISITED', answers: { outcome: ' Won ', notes: ' went well ', pics: ['p1'], sig: 's1' },
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.task.updateMany).not.toHaveBeenCalled(); // the write went through the transaction
    expect(tx.task.updateMany).toHaveBeenCalledWith({ where: { id: 't1', status: 'WORKING' }, data: { status: 'VISITED' } });
    const sub = tx.taskStepSubmission.create.mock.calls[0][0].data;
    expect(sub).toMatchObject({
      organizationId: 'o1', taskId: 't1', statusKey: 'VISITED', formVersion: 3, submittedById: 'tech',
      answers: { outcome: 'Won', notes: 'went well', pics: ['p1'], sig: 's1' },
    });
    expect(sub.form).toEqual(VISIT_FORM);
    // Ownership was asked of THIS task only.
    expect(prisma.attachment.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['p1', 's1'] }, taskId: 't1' });
    expect(prisma.taskEvent.create.mock.calls[0][0].data.metadata.stepSubmissionId).toBe('sub_0000000000000001');
    expect(res.data.stepSubmissionId).toBe('sub_0000000000000001');
  });

  it('refuses a missing required answer with STEP_FORM_INVALID and moves nothing', async () => {
    prisma.task.findUnique.mockResolvedValue(base());
    const body = await refusal(service.updateStatus({ ...tech, status: 'VISITED', answers: { notes: 'x' } }));
    expect(body).toMatchObject({ code: 'STEP_FORM_INVALID', params: { statusKey: 'VISITED', errors: [{ fieldId: 'outcome', code: 'required' }] } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
    expect(prisma.taskEvent.create).not.toHaveBeenCalled();
  });

  it('refuses when no answers are sent at all — the office too, for a step\'s own form', async () => {
    prisma.task.findUnique.mockResolvedValue(base());
    expect((await refusal(service.updateStatus({ ...boss, status: 'VISITED' }))).code).toBe('STEP_FORM_INVALID');
    expect(prisma.task.updateMany).not.toHaveBeenCalled();
  });

  it('refuses unknown keys and wrong types', async () => {
    prisma.task.findUnique.mockResolvedValue(base());
    const body = await refusal(service.updateStatus({ ...tech, status: 'VISITED', answers: { outcome: 'Maybe', hack: 1 } }));
    expect(body.params.errors).toEqual(expect.arrayContaining([
      { fieldId: 'hack', code: 'unknown_field' },
      { fieldId: 'outcome', code: 'not_an_option' },
    ]));
  });

  it('refuses a photo that is not an attachment of this job with STEP_FORM_FOREIGN_FILE', async () => {
    prisma.task.findUnique.mockResolvedValue(base());
    prisma.attachment.findMany.mockResolvedValue([{ id: 'p1', mimeType: 'image/jpeg', fileType: 'IMAGE' }]);
    const body = await refusal(service.updateStatus({ ...tech, status: 'VISITED', answers: { outcome: 'Won', pics: ['p1', 'other-task-photo'] } }));
    expect(body).toMatchObject({ code: 'STEP_FORM_FOREIGN_FILE', params: { statusKey: 'VISITED', fileIds: ['other-task-photo'] } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a signature that is not a PNG, and a "photo" that is a document', async () => {
    prisma.task.findUnique.mockResolvedValue(base());
    prisma.attachment.findMany.mockResolvedValue([
      { id: 'doc', mimeType: 'application/pdf', fileType: 'DOCUMENT' },
      { id: 'jpg', mimeType: 'image/jpeg', fileType: 'IMAGE' },
    ]);
    const body = await refusal(service.updateStatus({ ...tech, status: 'VISITED', answers: { outcome: 'Won', pics: ['doc'], sig: 'jpg' } }));
    expect(body.params.errors).toEqual([{ fieldId: 'pics', code: 'invalid_file' }, { fieldId: 'sig', code: 'invalid_file' }]);
  });

  it('leaves a step without a form exactly as it was — no transaction, no submission', async () => {
    prisma.task.findUnique.mockResolvedValue(base());
    const res: any = await service.updateStatus({ ...tech, status: 'PAUSED' });
    expect(res.success).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.task.updateMany).toHaveBeenCalledWith({ where: { id: 't1', status: 'WORKING' }, data: { status: 'PAUSED' } });
    expect(res.data.stepSubmissionId).toBeUndefined();
  });

  it('refuses answers sent to a step that asks nothing, rather than dropping them', async () => {
    prisma.task.findUnique.mockResolvedValue(base());
    const body = await refusal(service.updateStatus({ ...tech, status: 'PAUSED', answers: { notes: 'x' } }));
    expect(body).toMatchObject({ code: 'STEP_FORM_INVALID', params: { errors: [{ fieldId: 'notes', code: 'unknown_field' }] } });
    // An empty object is no answer at all.
    await expect(service.updateStatus({ ...tech, status: 'PAUSED', answers: {} })).resolves.toMatchObject({ success: true });
  });

  describe('the legacy report step (final + report capability, no form)', () => {
    const report = {
      work_done: 'Replaced the valve', photos_before: ['b1'], photos_after: ['a1'],
      tech_signature: 'ts', customer_name: 'Ann Berger', customer_signature: 'cs',
    };
    const files = [
      { id: 'b1', mimeType: 'image/jpeg', fileType: 'IMAGE' },
      { id: 'a1', mimeType: 'image/jpeg', fileType: 'IMAGE' },
      { id: 'ts', mimeType: 'image/png', fileType: 'IMAGE' },
      { id: 'cs', mimeType: 'image/png', fileType: 'IMAGE' },
    ];

    it('asks the assigned member for the field-service answers', async () => {
      prisma.task.findUnique.mockResolvedValue(base());
      const body = await refusal(service.updateStatus({ ...tech, status: 'COMPLETED' }));
      expect(body.code).toBe('STEP_FORM_INVALID');
      expect(body.params.errors.map((e: any) => e.fieldId)).toEqual(
        ['work_done', 'photos_before', 'photos_after', 'tech_signature', 'customer_name', 'customer_signature'],
      );
      expect(prisma.task.updateMany).not.toHaveBeenCalled();
    });

    it('stores them as a submission against the fieldService preset', async () => {
      prisma.task.findUnique.mockResolvedValue(base());
      prisma.attachment.findMany.mockResolvedValue(files);
      await service.updateStatus({ ...tech, status: 'COMPLETED', answers: report });
      const sub = tx.taskStepSubmission.create.mock.calls[0][0].data;
      expect(sub.statusKey).toBe('COMPLETED');
      expect(sub.form).toEqual(STEP_FORM_PRESETS.fieldService);
      expect(sub.formVersion).toBe(1);
    });

    it('does not stop the office dragging the card to Completed (it never needed a report)', async () => {
      prisma.task.findUnique.mockResolvedValue(base());
      await expect(service.updateStatus({ ...boss, status: 'COMPLETED' })).resolves.toMatchObject({ success: true });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('applies to a workflow-less job completing too — the shipped field-service flow', async () => {
      workflowCache.getWorkflow.mockResolvedValue(null);
      prisma.task.findUnique.mockResolvedValue(base({ workflowId: null, spaceId: null, status: 'IN_PROGRESS' }));
      expect((await refusal(service.updateStatus({ ...tech, status: 'COMPLETED' }))).code).toBe('STEP_FORM_INVALID');
    });
  });

  describe('CRM fields', () => {
    const crmCalls = () => auth.send.mock.calls.map(([pattern, payload]) => ({ cmd: pattern.cmd, ...payload }));

    it('writes the outcome as a note and the follow-up as a reminder, as the mover', async () => {
      prisma.task.findUnique.mockResolvedValue(base({ customerId: 'c1' }));
      await service.updateStatus({ ...tech, status: 'VISITED', answers: { outcome: 'Won', notes: 'Signed today', next: '2026-10-05' } });
      const calls = crmCalls();
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({
        cmd: 'add_customer_activity', customerId: 'c1', organizationId: 'o1', authorId: 'tech',
        type: 'NOTE', clientId: 'sub_0000000000000001-outcome', caller: { userId: 'tech', role: Role.EMPLOYEE },
      });
      expect(calls[0].body).toContain('Outcome: Won');
      expect(calls[0].body).toContain('Signed today');
      // 09:00 in Vienna on that day (UTC+2 in October).
      expect(calls[1]).toMatchObject({ type: 'REMINDER', dueAt: '2026-10-05T07:00:00.000Z', reminderAssigneeId: 'tech' });
    });

    it('writes nothing when the job has no client, or the workspace does not run CRM', async () => {
      prisma.task.findUnique.mockResolvedValue(base());
      await service.updateStatus({ ...tech, status: 'VISITED', answers: { outcome: 'Won' } });
      expect(auth.send).not.toHaveBeenCalled();

      prisma.task.findUnique.mockResolvedValue(base({ customerId: 'c1' }));
      prisma.companyLocation.findFirst.mockResolvedValue({ enabledModules: ['tracking'], organization: { enabledModules: ['crm'] } });
      await service.updateStatus({ ...tech, status: 'VISITED', answers: { outcome: 'Won' } });
      expect(auth.send).not.toHaveBeenCalled();
    });

    it('a CRM failure never undoes the move', async () => {
      prisma.task.findUnique.mockResolvedValue(base({ customerId: 'c1' }));
      auth.send.mockReturnValue(throwError(() => new Error('Customer not found')));
      const res: any = await service.updateStatus({ ...tech, status: 'VISITED', answers: { outcome: 'Won', next: '2026-10-05' } });
      expect(res.success).toBe(true);
      expect(tx.taskStepSubmission.create).toHaveBeenCalled();
    });
  });

  it('refuses a stale move without writing its answers (lost race)', async () => {
    prisma.task.findUnique.mockResolvedValueOnce(base()).mockResolvedValueOnce({ id: 't1', status: 'PAUSED' });
    tx.task.updateMany.mockResolvedValue({ count: 0 });
    const err: any = await service.updateStatus({ ...tech, status: 'VISITED', answers: { outcome: 'Won' } }).catch((e) => e);
    expect(err.getResponse()).toMatchObject({ code: 'TASK_STATE_CONFLICT' });
    expect(tx.taskStepSubmission.create).not.toHaveBeenCalled();
  });
});

describe('reading a job\'s submissions', () => {
  it('is gated like reading the task, and signs every photo in one query', async () => {
    const prisma: any = {
      task: { findUnique: jest.fn().mockResolvedValue(base()) },
      taskAssignee: { findFirst: jest.fn().mockResolvedValue(null) },
      taskStepSubmission: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'sub1', statusKey: 'VISITED', formVersion: 3, form: VISIT_FORM, answers: { outcome: 'Won', pics: ['p1'], sig: 's1' }, submittedById: 'tech', submittedAt: new Date() },
          { id: 'sub2', statusKey: 'VISITED', formVersion: 3, form: VISIT_FORM, answers: { outcome: 'Lost', pics: ['p2'] }, submittedById: 'gone', submittedAt: new Date() },
        ]),
      },
      attachment: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'p1', fileName: 'a.jpg', fileKey: 'k/p1', mimeType: 'image/jpeg' },
          { id: 'p2', fileName: 'b.jpg', fileKey: 'k/p2', mimeType: 'image/jpeg' },
          { id: 's1', fileName: 's.png', fileKey: 'k/s1', mimeType: 'image/png' },
        ]),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'tech', firstName: 'Mike', lastName: 'W', avatarUrl: null }]) },
    };
    const store = { mediaUrl: jest.fn(async (key: string) => `https://signed/${key}`), keyFromUrl: () => null };
    const module = await Test.createTestingModule({
      providers: [
        TasksService, ...TASK_SERVICE_PARTS, TaskAccessService,
        { provide: JobTimeService, useValue: {} }, ClockGateService, { provide: CrewService, useValue: crewStub() }, { provide: RolePoolService, useValue: { holdsOpenRole: jest.fn().mockResolvedValue(false), syncSpots: jest.fn().mockResolvedValue(undefined) } }, { provide: PresenceService, useValue: {} },
        { provide: PrismaService, useValue: prisma },
        { provide: 'NOTIFICATION_SERVICE', useValue: { emit: jest.fn() } },
        { provide: ConfigService, useValue: { get: (_k: string, d: unknown) => d } },
        { provide: WorkflowConfigCache, useValue: {} },
        { provide: NotificationRoutingService, useValue: {} },
        MediaSigner,
        { provide: OBJECT_STORE, useValue: store },
      ],
    }).compile();
    const service = module.get(TasksService);

    const res: any = await service.getSubmissions({ id: 't1', userId: 'tech', userRole: Role.EMPLOYEE, organizationId: 'o1' });
    expect(res.data).toHaveLength(2);
    expect(res.data[0].files.p1.url).toBe('https://signed/k/p1');
    expect(res.data[0].files.s1.url).toBe('https://signed/k/s1');
    expect(res.data[0].submittedBy.firstName).toBe('Mike');
    expect(res.data[1].files).toEqual({ p2: expect.objectContaining({ url: 'https://signed/k/p2' }) });
    expect(prisma.attachment.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.attachment.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['p1', 's1', 'p2'] }, taskId: 't1' });

    // Somebody who may not read the task may not read its reports.
    prisma.task.findUnique.mockResolvedValue(base({ assignedToId: 'someone-else' }));
    await expect(service.getSubmissions({ id: 't1', userId: 'tech', userRole: Role.EMPLOYEE, organizationId: 'o1' })).rejects.toThrow('Access denied');
  });
});
