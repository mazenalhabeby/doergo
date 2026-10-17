import { resolveSpaceDefaultWorkflowId, resolveSpaceDefaultWorkflowIds } from '../space-workflow.util';

/*
  The batch must answer exactly what the one-space rule answers, space by space:
  the default row when there is one, else the space's column, else null.
*/
describe('resolveSpaceDefaultWorkflowIds', () => {
  const rows = [
    { spaceId: 's-row', workflowId: 'wf-row' },
    { spaceId: 's-both', workflowId: 'wf-join' },
  ];
  const columns = [
    { id: 's-row', workflowId: 'wf-col-ignored' },
    { id: 's-both', workflowId: 'wf-col-ignored' },
    { id: 's-col', workflowId: 'wf-col' },
    { id: 's-none', workflowId: null },
  ];
  const prisma = {
    spaceWorkflow: {
      findFirst: jest.fn(async ({ where }: any) => rows.find((r) => r.spaceId === where.spaceId) ?? null),
      findMany: jest.fn(async ({ where }: any) => rows.filter((r) => where.spaceId.in.includes(r.spaceId))),
    },
    companyLocation: {
      findUnique: jest.fn(async ({ where }: any) => columns.find((c) => c.id === where.id) ?? null),
      findMany: jest.fn(async ({ where }: any) => columns.filter((c) => where.id.in.includes(c.id))),
    },
  } as any;

  it('agrees with the one-space rule for every kind of space', async () => {
    const ids = ['s-row', 's-both', 's-col', 's-none', 's-missing'];
    const batch = await resolveSpaceDefaultWorkflowIds(prisma, [...ids, null, undefined, 's-row']);
    for (const id of ids) expect(batch.get(id)).toBe(await resolveSpaceDefaultWorkflowId(prisma, id));
    expect([...batch.keys()].sort()).toEqual([...ids].sort());
  });

  it('asks twice at most, whatever the count — and not at all for none', async () => {
    prisma.spaceWorkflow.findMany.mockClear();
    prisma.companyLocation.findMany.mockClear();
    await resolveSpaceDefaultWorkflowIds(prisma, ['s-row', 's-col', 's-none']);
    expect(prisma.spaceWorkflow.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.companyLocation.findMany).toHaveBeenCalledTimes(1);
    prisma.spaceWorkflow.findMany.mockClear();
    expect((await resolveSpaceDefaultWorkflowIds(prisma, [null])).size).toBe(0);
    expect(prisma.spaceWorkflow.findMany).not.toHaveBeenCalled();
  });
});
