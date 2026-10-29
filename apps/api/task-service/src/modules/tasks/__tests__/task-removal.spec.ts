import { ConflictException } from '@nestjs/common';
import { Role } from '@hbcfield/shared';
import { TaskRemovalService, TASK_HAS_FINISHED_SUBTASKS } from '../records/task-removal.service';
import { MediaSigner } from '../../../common/storage/media-signer.service';

/*
  Deleting a parent cascades to its sub-jobs in the database (tasks.parentId ON
  DELETE CASCADE). Decided 2026-10-29: a finished sub-job stops the delete; the
  rest go WITH the parent, each announced like a single delete, each file removed.
*/
const FLOW = {
  id: 'wf',
  statuses: [
    { key: 'TODO', isFinal: false, isCanceled: false, capabilities: [] },
    { key: 'DONE', isFinal: true, isCanceled: false, capabilities: [] },
    { key: 'DROPPED', isFinal: true, isCanceled: true, capabilities: [] },
  ],
};
const job = (id: string, status: string, workflowId: string | null = 'wf') => ({
  id,
  status,
  organizationId: 'org',
  workflowId,
  spaceId: 'sp' as string | null,
});

function build(children: Record<string, ReturnType<typeof job>[]>) {
  const prisma: any = {
    task: {
      findUnique: jest.fn().mockResolvedValue(job('root', 'TODO')),
      findMany: jest.fn(async ({ where }: any) => (where.parentId.in as string[]).flatMap((id) => children[id] ?? [])),
      delete: jest.fn(),
    },
    attachment: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'a1', fileKey: 'org/root/a1.jpg', fileUrl: null },
        { id: 'a2', fileKey: 'org/kid/a2.pdf', fileUrl: null },
      ]),
    },
  };
  const emit = jest.fn();
  const rules = { clearItem: jest.fn().mockResolvedValue(undefined) };
  const support = { invalidateStatusCountsCache: jest.fn() };
  const store: any = { delete: jest.fn().mockResolvedValue(true), keyFromUrl: () => null };
  const service = new TaskRemovalService(
    prisma,
    { emit } as any,
    support as any,
    rules as any,
    { getWorkflow: jest.fn().mockResolvedValue(FLOW) } as any,
    new MediaSigner(store),
    store,
  );
  return { service, prisma, emit, rules, store };
}
const caller = { id: 'root', userId: 'u', userRole: Role.ADMIN, organizationId: 'org' } as any;

describe('deleting a job with sub-jobs', () => {
  it('a FINISHED sub-job (the flow’s final, non-canceled step) stops the delete, however deep', async () => {
    const { service, prisma } = build({ root: [job('kid', 'TODO')], kid: [job('grandkid', 'DONE')] });
    const err = await service.remove(caller).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: TASK_HAS_FINISHED_SUBTASKS, params: { count: 1 } });
    expect(prisma.task.delete).not.toHaveBeenCalled();
  });

  it('a canonical COMPLETED sub-job counts as finished too', async () => {
    const { service } = build({ root: [{ ...job('kid', 'COMPLETED', null), spaceId: null }] });
    await expect(service.remove(caller)).rejects.toBeInstanceOf(ConflictException);
  });

  it('unfinished sub-jobs go with it: each announced, each approval cleared, every file removed', async () => {
    const { service, prisma, emit, rules, store } = build({
      root: [job('kid', 'TODO'), job('dropped', 'DROPPED')],
      kid: [job('grandkid', 'TODO')],
    });
    await service.remove(caller);
    expect(prisma.task.delete).toHaveBeenCalledWith({ where: { id: 'root' } });
    expect(prisma.attachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { taskId: { in: ['root', 'kid', 'dropped', 'grandkid'] } } }),
    );
    const announced = emit.mock.calls.map(([, payload]) => payload.taskId);
    expect(announced).toEqual(['root', 'kid', 'dropped', 'grandkid']);
    expect(rules.clearItem).toHaveBeenCalledTimes(4);
    expect(store.delete.mock.calls.map(([k]: [string]) => k)).toEqual(['org/root/a1.jpg', 'org/kid/a2.pdf']);
  });

  it('a file that will not go never fails the delete', async () => {
    const { service, store } = build({});
    store.delete.mockRejectedValueOnce(new Error('S3 down'));
    await expect(service.remove(caller)).resolves.toMatchObject({ success: true });
  });
});
