/**
 * A crew's checklist: whose item it is, and who ticked it (shared tasks/checklist.ts).
 *
 * The rules are pinned first, pure; then the service, which is the boundary —
 * the owner change is judged on authority the SERVER resolved, never on a body.
 */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { OBJECT_STORE } from '@hbcfield/shared/storage';
import {
  CHECKLIST_CODES, Role, checklistCompletion, mayChangeChecklistOwner, mayEditChecklistItem, openChecklistOf, splitChecklist, tickedByOther,
  type ChecklistAuthority,
} from '@hbcfield/shared';
import { TasksService } from '../tasks.service';
import { RolePoolService } from '../role-pool.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { WorkflowConfigCache } from '../../../common/cache/workflow-config-cache.service';
import { NotificationRoutingService } from '../../../common/notification-routing.service';
import { MediaSigner } from '../../../common/storage/media-signer.service';
import { JobTimeService } from '../handover/job-time.service';
import { PresenceService } from '../../attendance/presence/presence.service';
import { ClockGateService } from '../handover/clock-gate.service';
import { CrewService } from '../handover/crew.service';

const crew = ['lead', 'priya', 'conor'];
const as = (actorId: string, over: Partial<ChecklistAuthority> = {}): ChecklistAuthority =>
  ({ actorId, isOffice: false, leaderId: 'lead', crewIds: crew, ...over });

describe('checklist rules', () => {
  it('the leader and the office give any item to anybody on the crew', () => {
    expect(mayChangeChecklistOwner(as('lead'), null, 'priya')).toEqual({ ok: true });
    expect(mayChangeChecklistOwner(as('lead'), 'priya', 'conor')).toEqual({ ok: true });
    expect(mayChangeChecklistOwner(as('mara', { isOffice: true }), 'conor', null)).toEqual({ ok: true });
  });

  it('an acting leader counts as the leader', () => {
    expect(mayChangeChecklistOwner(as('priya', { leaderId: 'priya' }), 'conor', 'priya')).toEqual({ ok: true });
  });

  it('nobody is given an item who is not on THIS crew — not even by the office', () => {
    expect(mayChangeChecklistOwner(as('lead'), null, 'stranger')).toEqual({ ok: false, code: CHECKLIST_CODES.OWNER_NOT_ON_CREW });
    expect(mayChangeChecklistOwner(as('mara', { isOffice: true }), null, 'stranger')).toEqual({ ok: false, code: CHECKLIST_CODES.OWNER_NOT_ON_CREW });
  });

  it('a member takes a free item for themselves, and gives back their own', () => {
    expect(mayChangeChecklistOwner(as('priya'), null, 'priya')).toEqual({ ok: true });
    expect(mayChangeChecklistOwner(as('priya'), 'priya', null)).toEqual({ ok: true });
  });

  it('a member never takes somebody else\'s item, nor hands items out', () => {
    expect(mayChangeChecklistOwner(as('priya'), 'conor', 'priya')).toEqual({ ok: false, code: CHECKLIST_CODES.OWNER_NOT_YOURS });
    expect(mayChangeChecklistOwner(as('priya'), null, 'conor')).toEqual({ ok: false, code: CHECKLIST_CODES.OWNER_NOT_YOURS });
    expect(mayChangeChecklistOwner(as('priya'), 'conor', null)).toEqual({ ok: false, code: CHECKLIST_CODES.OWNER_NOT_YOURS });
  });

  it('somebody off the crew takes nothing, even a free item for themselves', () => {
    expect(mayChangeChecklistOwner(as('stranger'), null, 'stranger')).toEqual({ ok: false, code: CHECKLIST_CODES.OWNER_NOT_ON_CREW });
  });

  it('no change is always fine', () => {
    expect(mayChangeChecklistOwner(as('priya'), 'conor', 'conor')).toEqual({ ok: true });
  });

  it('a tick records who and when; an untick clears both', () => {
    const at = new Date('2026-10-03T09:42:00Z');
    expect(checklistCompletion(true, 'priya', at)).toEqual({ isCompleted: true, completedById: 'priya', completedAt: at });
    expect(checklistCompletion(false, 'priya', at)).toEqual({ isCompleted: false, completedById: null, completedAt: null });
  });

  it('mine first, then the crew, each in the checklist\'s own order', () => {
    const items = [
      { id: 'c', isCompleted: false, position: 2, assigneeId: 'priya' },
      { id: 'a', isCompleted: false, position: 0, assigneeId: 'conor' },
      { id: 'b', isCompleted: true, position: 1, assigneeId: 'priya' },
      { id: 'd', isCompleted: false, position: 3, assigneeId: null },
    ];
    const { mine, crew: rest } = splitChecklist(items, 'priya');
    expect(mine.map((i) => i.id)).toEqual(['b', 'c']);
    expect(rest.map((i) => i.id)).toEqual(['a', 'd']);
    expect(openChecklistOf(items, 'priya').map((i) => i.id)).toEqual(['c']);
    expect(splitChecklist(items, null).mine).toEqual([]);
  });

  it('somebody else\'s item is reworded or removed only by them, the leader or the office', () => {
    expect(mayEditChecklistItem(as('priya'), null)).toEqual({ ok: true });
    expect(mayEditChecklistItem(as('priya'), 'priya')).toEqual({ ok: true });
    expect(mayEditChecklistItem(as('lead'), 'conor')).toEqual({ ok: true });
    expect(mayEditChecklistItem(as('mara', { isOffice: true }), 'conor')).toEqual({ ok: true });
    expect(mayEditChecklistItem(as('priya'), 'conor')).toEqual({ ok: false, code: CHECKLIST_CODES.ITEM_NOT_YOURS });
  });

  it('says when somebody did another person\'s item', () => {
    expect(tickedByOther({ isCompleted: true, assigneeId: 'lead', completedById: 'conor' })).toBe(true);
    expect(tickedByOther({ isCompleted: true, assigneeId: 'lead', completedById: 'lead' })).toBe(false);
    expect(tickedByOther({ isCompleted: true, assigneeId: null, completedById: 'conor' })).toBe(false);
  });
});

describe('TasksService checklist — the boundary', () => {
  let service: TasksService;
  let authority: ChecklistAuthority;
  const crewService = { checklistAuthority: jest.fn(async () => authority) };
  const prisma: any = {
    task: { findUnique: jest.fn() },
    taskAssignee: { findFirst: jest.fn() },
    taskEvent: { create: jest.fn().mockResolvedValue({}) },
    checklistItem: { findFirst: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn(), delete: jest.fn() },
  };
  const task = { id: 't1', organizationId: 'o1', assignedToId: 'lead', createdById: 'mara', spaceId: null, status: 'IN_PROGRESS' };
  const priya = { userId: 'priya', userRole: Role.EMPLOYEE, organizationId: 'o1' };

  beforeEach(async () => {
    jest.clearAllMocks();
    authority = as('priya');
    prisma.task.findUnique.mockResolvedValue(task);
    prisma.taskAssignee.findFirst.mockResolvedValue({ id: 'row' }); // priya is on the job
    prisma.checklistItem.findFirst.mockResolvedValue({ id: 'i1', text: 'Unit 2 wiring', assigneeId: null, isCompleted: false });
    prisma.checklistItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.checklistItem.findUniqueOrThrow.mockResolvedValue({ id: 'i1', text: 'Unit 2 wiring', assigneeId: null, assignee: null, isCompleted: false });
    prisma.checklistItem.create.mockImplementation(async ({ data }: any) => ({ id: 'i2', ...data }));
    const module = await Test.createTestingModule({
      providers: [
        TasksService, { provide: JobTimeService, useValue: {} }, ClockGateService, { provide: CrewService, useValue: crewService }, { provide: RolePoolService, useValue: { holdsOpenRole: jest.fn().mockResolvedValue(false), syncSpots: jest.fn().mockResolvedValue(undefined) } },
        { provide: PresenceService, useValue: { onJobMoved: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: 'NOTIFICATION_SERVICE', useValue: { emit: jest.fn() } },
        { provide: ConfigService, useValue: { get: (_k: string, d: unknown) => d } },
        { provide: WorkflowConfigCache, useValue: { getWorkflow: jest.fn().mockResolvedValue(null) } },
        { provide: NotificationRoutingService, useValue: { resolveWatchers: jest.fn().mockResolvedValue({ ids: [] }) } },
        MediaSigner,
        { provide: OBJECT_STORE, useValue: null },
      ],
    }).compile();
    service = module.get(TasksService);
  });

  it('a tick writes who and when — from the token, not the body', async () => {
    await service.updateChecklistItem({ ...priya, taskId: 't1', itemId: 'i1', isCompleted: true, completedById: 'lead' } as any);
    const data = prisma.checklistItem.updateMany.mock.calls[0][0].data;
    expect(data).toMatchObject({ isCompleted: true, completedById: 'priya' });
    expect(data.completedAt).toBeInstanceOf(Date);
    // No owner was asked about, so nobody's authority was worked out.
    expect(crewService.checklistAuthority).not.toHaveBeenCalled();
  });

  it('ticking an item already ticked keeps the first name and time — nothing is written', async () => {
    prisma.checklistItem.findFirst.mockResolvedValue({ id: 'i1', text: 'x', assigneeId: null, isCompleted: true });
    await service.updateChecklistItem({ ...priya, taskId: 't1', itemId: 'i1', isCompleted: true });
    expect(prisma.checklistItem.updateMany).not.toHaveBeenCalled();
  });

  it('two people taking one free item: the write is conditional, and the loser is told (409)', async () => {
    prisma.checklistItem.updateMany.mockResolvedValue({ count: 0 }); // somebody got there first
    await expect(service.updateChecklistItem({ ...priya, taskId: 't1', itemId: 'i1', assigneeId: 'priya' })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.checklistItem.updateMany.mock.calls[0][0].where).toEqual({ id: 'i1', taskId: 't1', assigneeId: null, isCompleted: false });
    expect(prisma.taskEvent.create).not.toHaveBeenCalled();
  });

  it('a member cannot reword or remove somebody else\'s item; the owner and the leader can', async () => {
    prisma.checklistItem.findFirst.mockResolvedValue({ id: 'i1', text: 'Crane', assigneeId: 'conor', isCompleted: false });
    await expect(service.updateChecklistItem({ ...priya, taskId: 't1', itemId: 'i1', text: 'Mine now' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.deleteChecklistItem({ ...priya, taskId: 't1', itemId: 'i1' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.checklistItem.delete).not.toHaveBeenCalled();
    authority = as('lead');
    await service.deleteChecklistItem({ userId: 'lead', userRole: Role.EMPLOYEE, organizationId: 'o1', taskId: 't1', itemId: 'i1' });
    expect(prisma.checklistItem.delete).toHaveBeenCalled();
  });

  it('a free or own item is removed without asking who leads', async () => {
    prisma.checklistItem.findFirst.mockResolvedValue({ id: 'i1', text: 'x', assigneeId: 'priya', isCompleted: false });
    await service.deleteChecklistItem({ ...priya, taskId: 't1', itemId: 'i1' });
    expect(crewService.checklistAuthority).not.toHaveBeenCalled();
  });

  it('a member takes a free item; the history says so', async () => {
    await service.updateChecklistItem({ ...priya, taskId: 't1', itemId: 'i1', assigneeId: 'priya' });
    expect(prisma.checklistItem.updateMany.mock.calls[0][0].data).toEqual({ assigneeId: 'priya' });
    expect(prisma.taskEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: 'CHECKLIST_ITEM_ASSIGNED' }),
    }));
  });

  it('a member cannot take somebody else\'s item — 403, nothing written', async () => {
    prisma.checklistItem.findFirst.mockResolvedValue({ id: 'i1', text: 'x', assigneeId: 'conor', isCompleted: false });
    await expect(service.updateChecklistItem({ ...priya, taskId: 't1', itemId: 'i1', assigneeId: 'priya' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.checklistItem.updateMany).not.toHaveBeenCalled();
  });

  it('an owner off the crew is refused even for the leader — 400 with a code', async () => {
    authority = as('lead');
    await expect(service.updateChecklistItem({ userId: 'lead', userRole: Role.EMPLOYEE, organizationId: 'o1', taskId: 't1', itemId: 'i1', assigneeId: 'stranger12345678901' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.checklistItem.updateMany).not.toHaveBeenCalled();
  });

  it('a new item with an owner is judged like any owner change', async () => {
    await expect(service.addChecklistItem({ ...priya, taskId: 't1', text: 'x', position: 0, assigneeId: 'conor' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.checklistItem.create).not.toHaveBeenCalled();
    authority = as('lead');
    await service.addChecklistItem({ userId: 'lead', userRole: Role.EMPLOYEE, organizationId: 'o1', taskId: 't1', text: 'x', position: 0, assigneeId: 'conor' });
    expect(prisma.checklistItem.create.mock.calls[0][0].data).toMatchObject({ assigneeId: 'conor' });
  });

  it('another organization\'s job is refused before any rule is asked', async () => {
    prisma.task.findUnique.mockResolvedValue({ ...task, organizationId: 'other' });
    await expect(service.updateChecklistItem({ ...priya, taskId: 't1', itemId: 'i1', assigneeId: 'priya' })).rejects.toThrow();
    expect(crewService.checklistAuthority).not.toHaveBeenCalled();
    expect(prisma.checklistItem.updateMany).not.toHaveBeenCalled();
  });
});
