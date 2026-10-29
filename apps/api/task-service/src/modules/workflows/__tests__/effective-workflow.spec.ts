import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { effectiveWorkflowId, effectiveWorkflowIds, effectiveWorkflowOf } from '../effective-workflow';

/*
  ONE answer to "which flow does this job follow". The report, the job page, the
  list and the chat read the workspace's bare column while the status code read
  its SpaceWorkflow DEFAULT; where the two differed, a CLOSED job's report said
  "not finished" (409 REPORT_NOT_FINISHED), found on local data.
*/
const prismaWith = (defaults: Record<string, string>, column: Record<string, string | null>) =>
  ({
    spaceWorkflow: {
      findFirst: async ({ where }: any) => (defaults[where.spaceId] ? { workflowId: defaults[where.spaceId] } : null),
      findMany: async ({ where }: any) =>
        (where.spaceId.in as string[])
          .filter((id) => defaults[id])
          .map((id) => ({ spaceId: id, workflowId: defaults[id] })),
    },
    companyLocation: {
      findUnique: async ({ where }: any) => (where.id in column ? { workflowId: column[where.id] } : null),
      findMany: async ({ where }: any) =>
        (where.id.in as string[]).filter((id) => id in column).map((id) => ({ id, workflowId: column[id] })),
    },
  }) as any;

describe('the effective workflow of a job', () => {
  const prisma = prismaWith({ sp: 'wf-default' }, { sp: 'wf-stale-column', old: 'wf-column' });

  it('a job without its own flow follows the workspace DEFAULT, not the stale column', async () => {
    expect(await effectiveWorkflowId(prisma, { workflowId: null, spaceId: 'sp' })).toBe('wf-default');
    expect(await effectiveWorkflowId(prisma, { workflowId: null, spaceId: 'old' })).toBe('wf-column');
    expect(await effectiveWorkflowId(prisma, { workflowId: 'own', spaceId: 'sp' })).toBe('own');
    expect(await effectiveWorkflowId(prisma, { workflowId: null, spaceId: null })).toBeNull();
  });

  it('the batch answers what one-by-one answers', async () => {
    const tasks = [
      { workflowId: null, spaceId: 'sp' },
      { workflowId: 'own', spaceId: 'sp' },
      { workflowId: null, spaceId: 'old' },
      { workflowId: null, spaceId: null },
    ];
    const batch = await effectiveWorkflowIds(prisma, tasks);
    for (const t of tasks) expect(batch.get(t)).toBe(await effectiveWorkflowId(prisma, t));
  });

  it('reads the flow in the JOB’s organization (a guest never reads their own)', async () => {
    const getWorkflow = jest.fn().mockResolvedValue({ id: 'wf-default' });
    await effectiveWorkflowOf(prisma, { getWorkflow } as any, {
      organizationId: 'owner-org',
      workflowId: null,
      spaceId: 'sp',
    });
    expect(getWorkflow).toHaveBeenCalledWith('owner-org', 'wf-default');
  });
});

describe('nobody reads a job’s flow from the bare workspace column', () => {
  const ROOT = join(__dirname, '..', '..', '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== '__tests__' && name !== 'node_modules') walk(p);
      } else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) files.push(p);
    }
  };
  walk(ROOT);

  it('every reader goes through effective-workflow.ts', () => {
    const offenders = files.filter((f) => /workflowId \?\? [\w.]*space\??\.workflowId/.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => f.slice(ROOT.length + 1))).toEqual([]);
  });
});
