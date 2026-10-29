import { BadRequestException } from '@nestjs/common';
import { Role } from '@hbcfield/shared';
import { TaskUpdateService } from '../records/task-update.service';
import { TaskRemovalService } from '../records/task-removal.service';
import { stepState } from '../records/task-step-state';

/*
  Edit and delete knew only the canonical names (COMPLETED, CLOSED, CANCELED,
  IN_PROGRESS). On a custom flow a DONE job could be rewritten, and a job
  somebody was DOING could be deleted under them. Both now read the job's flow.
*/
const FLOW = {
  id: 'wf-office',
  name: 'Office',
  statuses: [
    { key: 'TODO', isFinal: false, isCanceled: false, capabilities: [] },
    { key: 'DOING', isFinal: false, isCanceled: false, capabilities: ['timer'] },
    { key: 'DONE', isFinal: true, isCanceled: false, capabilities: [] },
    { key: 'DROPPED', isFinal: true, isCanceled: true, capabilities: [] },
  ],
};

describe('where a job stands, by its flow', () => {
  it('reads the flow’s own marks and capabilities', () => {
    expect(stepState('DONE', FLOW)).toEqual({ finished: true, canceled: false, working: false });
    expect(stepState('DROPPED', FLOW)).toEqual({ finished: false, canceled: true, working: false });
    expect(stepState('DOING', FLOW)).toEqual({ finished: false, canceled: false, working: true });
    expect(stepState('TODO', FLOW)).toEqual({ finished: false, canceled: false, working: false });
  });

  it('falls back to the canonical names for a step the flow does not define', () => {
    expect(stepState('COMPLETED', null).finished).toBe(true);
    expect(stepState('CANCELED', null).canceled).toBe(true);
    expect(stepState('IN_PROGRESS', null).working).toBe(true);
    expect(stepState('NEW', null)).toEqual({ finished: false, canceled: false, working: false });
  });
});

describe('editing and deleting a job on a custom flow', () => {
  const build = (status: string) => {
    const task = { id: 't1', organizationId: 'org', spaceId: null, workflowId: 'wf-office', status };
    const prisma: any = {
      task: { findUnique: jest.fn().mockResolvedValue(task), delete: jest.fn(), update: jest.fn() },
      attachment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const workflows: any = { getWorkflow: jest.fn().mockResolvedValue(FLOW) };
    const service = new TaskUpdateService(prisma, { emit: jest.fn() } as any, {} as any, workflows);
    const removal = new TaskRemovalService(
      prisma,
      { emit: jest.fn() } as any,
      {} as any,
      {} as any,
      workflows,
      {} as any,
      null,
    );
    return { service, removal, prisma };
  };
  const caller = { userId: 'u', userRole: Role.ADMIN, organizationId: 'org' } as any;

  it('a DONE job is not rewritten', async () => {
    const { service, prisma } = build('DONE');
    await expect(service.update({ ...caller, id: 't1', title: 'x' })).rejects.toThrow(BadRequestException);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('a job somebody is DOING, or that is DONE, is not deleted', async () => {
    for (const status of ['DOING', 'DONE']) {
      const { removal, prisma } = build(status);
      await expect(removal.remove({ ...caller, id: 't1' })).rejects.toThrow(BadRequestException);
      expect(prisma.task.delete).not.toHaveBeenCalled();
    }
  });
});
