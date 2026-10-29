import { ConflictException } from '@nestjs/common';
import { Role } from '@hbcfield/shared';
import { TaskUpdateService } from '../records/task-update.service';
import { TASK_STEP_NOT_IN_DESTINATION_FLOW } from '../records/task-move-flow';

/*
  A job without its own flow follows its workspace's default. Moving it used to
  switch it silently onto the destination's flow, where its step may not exist.
*/
const FLOWS: Record<string, { id: string; statuses: { key: string; isFinal?: boolean; isCanceled?: boolean }[] }> = {
  'wf-a': { id: 'wf-a', statuses: [{ key: 'TODO' }, { key: 'PICKED_UP' }, { key: 'DONE', isFinal: true }] },
  'wf-b': { id: 'wf-b', statuses: [{ key: 'TODO' }, { key: 'DOING' }, { key: 'DONE', isFinal: true }] },
};
const DEFAULTS: Record<string, string> = { 'sp-a': 'wf-a', 'sp-b': 'wf-b' };

function build(task: Record<string, unknown>) {
  const prisma: any = {
    task: { findUnique: jest.fn().mockResolvedValue(task), update: jest.fn().mockResolvedValue({ ...task }) },
    spaceWorkflow: { findFirst: jest.fn(async ({ where }: any) => ({ workflowId: DEFAULTS[where.spaceId] })) },
    companyLocation: { findFirst: jest.fn(async ({ where }: any) => ({ id: where.id, isRemote: false })) },
  };
  const workflows: any = { getWorkflow: jest.fn(async (_org: string, id: string) => FLOWS[id] ?? null) };
  const support: any = { createTaskEvent: jest.fn(), invalidateStatusCountsCache: jest.fn() };
  return { service: new TaskUpdateService(prisma, { emit: jest.fn() } as any, support, workflows), prisma };
}
const admin = { userId: 'u', userRole: Role.ADMIN, organizationId: 'org' } as any;
const job = (status: string, workflowId: string | null = null) => ({
  id: 't1',
  organizationId: 'org',
  spaceId: 'sp-a',
  workflowId,
  status,
  openRoleId: null,
});

describe('moving a job to another workspace keeps it on a flow that has its step', () => {
  it('a job PICKED_UP on the old default is refused a move onto a flow without that step', async () => {
    const { service, prisma } = build(job('PICKED_UP'));
    const err = await service.update({ ...admin, id: 't1', spaceId: 'sp-b' }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: TASK_STEP_NOT_IN_DESTINATION_FLOW, params: { status: 'PICKED_UP' } });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('a step both flows have moves freely', async () => {
    const { service, prisma } = build(job('TODO'));
    await service.update({ ...admin, id: 't1', spaceId: 'sp-b' });
    expect(prisma.task.update).toHaveBeenCalled();
  });

  it('a job with its OWN flow keeps it, whatever the destination runs', async () => {
    const { service, prisma } = build(job('PICKED_UP', 'wf-a'));
    await service.update({ ...admin, id: 't1', spaceId: 'sp-b' });
    expect(prisma.task.update).toHaveBeenCalled();
  });
});
