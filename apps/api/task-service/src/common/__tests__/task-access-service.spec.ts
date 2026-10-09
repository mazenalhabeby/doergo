import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@hbcfield/shared';
import { TaskAccessService } from '../task-access/task-access.service';
import { AttachmentsService } from '../../modules/attachments/attachments.service';
import { CustomFieldsService } from '../../modules/custom-fields/custom-fields.service';
import { MediaSigner } from '../storage/media-signer.service';

/**
 * ONE task gate (common/task-access), asked by tasks, attachments, reports and
 * custom fields.
 *
 * Regressions it pins:
 *   • the attachments copy never looked up co-assignee rows — a crew member
 *     without canViewAllTasks could comment on a job and was refused its photos;
 *   • the attachments/reports copies asked "does this person hold the job's
 *     open role?" BEFORE the organization boundary;
 *   • custom-field values were readable and writable on ANY task of the org.
 */
describe('TaskAccessService — the one task gate', () => {
  const ORG = 'org-1';
  const prisma: any = {
    task: { findUnique: jest.fn() },
    taskAssignee: { findFirst: jest.fn() },
    spaceAssignment: { findFirst: jest.fn() },
    attachment: { findMany: jest.fn() },
    customFieldDefinition: { findMany: jest.fn() },
    customFieldValue: { findMany: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn(),
  };
  const task = (over: Record<string, unknown> = {}) => ({
    id: 't-1',
    organizationId: ORG,
    spaceId: 'space-1',
    createdById: 'someone',
    assignedToId: 'lead',
    workflowId: null,
    openRoleId: null,
    status: 'NEW',
    ...over,
  });
  /** A crew member: on the task through a TaskAssignee row, no view-all grant. */
  const crewMember = { userId: 'crew-1', userRole: Role.EMPLOYEE, organizationId: ORG };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.taskAssignee.findFirst.mockResolvedValue(null);
    prisma.spaceAssignment.findFirst.mockResolvedValue(null);
    prisma.attachment.findMany.mockResolvedValue([]);
    prisma.customFieldDefinition.findMany.mockResolvedValue([]);
    prisma.customFieldValue.findMany.mockResolvedValue([]);
  });

  it('a co-assignee (crew row only) may list the job’s photos', async () => {
    prisma.task.findUnique.mockResolvedValue(task());
    prisma.taskAssignee.findFirst.mockResolvedValue({ id: 'row' });
    const attachments = new AttachmentsService(prisma, null, new MediaSigner(null), { emit: jest.fn() } as never);
    await expect(attachments.findByTask({ taskId: 't-1', ...crewMember } as never)).resolves.toBeDefined();
  });

  it('somebody NOT on the job is still refused its photos', async () => {
    prisma.task.findUnique.mockResolvedValue(task());
    const attachments = new AttachmentsService(prisma, null, new MediaSigner(null), { emit: jest.fn() } as never);
    await expect(attachments.findByTask({ taskId: 't-1', ...crewMember } as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('the organization boundary comes before the role-holder exemption', async () => {
    const gate = new TaskAccessService(prisma);
    // A task of ANOTHER organization, open to a role; the lookup would say "holds it".
    prisma.spaceAssignment.findFirst.mockResolvedValue({ user: { role: Role.EMPLOYEE, enabledModules: null, isExternal: false } });
    const foreign = task({ organizationId: 'org-2', openRoleId: 'role-1', openSpotsLeft: 1 });
    await expect(gate.assert(foreign, crewMember, { roleHolderMayRead: true })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.spaceAssignment.findFirst).not.toHaveBeenCalled();
    expect(prisma.taskAssignee.findFirst).not.toHaveBeenCalled();
  });

  it('the role-holder exemption never covers a write', async () => {
    const gate = new TaskAccessService(prisma);
    prisma.spaceAssignment.findFirst.mockResolvedValue({ user: { role: Role.EMPLOYEE, enabledModules: null, isExternal: false } });
    const open = task({ openRoleId: 'role-1', openSpotsLeft: 1 });
    await expect(gate.assert(open, crewMember)).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('custom-field values go through the same gate', () => {
    const fields = () => new CustomFieldsService(prisma);

    it('refuses reading the values of a task the caller cannot open', async () => {
      prisma.task.findUnique.mockResolvedValue(task());
      await expect(fields().getTaskValues({ taskId: 't-1', ...crewMember })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses writing them too', async () => {
      prisma.task.findUnique.mockResolvedValue(task());
      await expect(
        fields().setTaskValues({ taskId: 't-1', ...crewMember, values: [{ definitionId: 'd', value: 'x' }] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.customFieldValue.upsert).not.toHaveBeenCalled();
    });

    it('lets somebody on the job read them', async () => {
      prisma.task.findUnique.mockResolvedValue(task({ assignedToId: 'crew-1' }));
      await expect(fields().getTaskValues({ taskId: 't-1', ...crewMember })).resolves.toBeDefined();
    });

    it('a task of another organization is 404, as before', async () => {
      prisma.task.findUnique.mockResolvedValue(task({ organizationId: 'org-2' }));
      await expect(fields().getTaskValues({ taskId: 't-1', ...crewMember })).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
