import { BadRequestException } from '@nestjs/common';
import { WorkflowsService } from '../workflows.service';

/**
 * A task type scoped to one space belongs to that space alone.
 *
 * `spaceMayOffer` is tested on its own elsewhere; this asserts it is actually
 * WIRED IN, which is the part that fails silently. Without the check, adding
 * another space's local type here would hand this space edit rights over a flow
 * the other believes is private — and the edit would land on both, with neither
 * being told.
 */
describe('attachSpaceWorkflow — scope is enforced, not just defined', () => {
  const ORG = 'org-1';

  const sound = [
    { key: 'NEW', name: 'New', position: 0, isFinal: false, isCanceled: false, transitions: ['DONE'], capabilities: [] },
    { key: 'DONE', name: 'Done', position: 1, isFinal: true, isCanceled: false, transitions: [], capabilities: [] },
  ];

  const workflows: Record<string, any> = {
    'wf-shared': { id: 'wf-shared', organizationId: ORG, ownerSpaceId: null, statuses: sound },
    'wf-local-a': { id: 'wf-local-a', organizationId: ORG, ownerSpaceId: 'sp-a', statuses: sound },
  };

  let upserts: any[];

  const makeService = () => {
    upserts = [];
    const prisma: any = {
      companyLocation: {
        findFirst: async ({ where }: any) =>
          where.organizationId === ORG && ['sp-a', 'sp-b'].includes(where.id) ? { id: where.id } : null,
        findUnique: async ({ where }: any) => ({ id: where.id, organizationId: ORG, enabledModules: [] }),
      },
      statusWorkflow: {
        findFirst: async ({ where }: any) =>
          workflows[where.id] && workflows[where.id].organizationId === where.organizationId
            ? { id: where.id }
            : null,
        findUnique: async ({ where }: any) => workflows[where.id] ?? null,
      },
      spaceWorkflow: {
        count: async () => 1,
        upsert: async ({ create }: any) => { upserts.push(create); return create; },
        updateMany: async () => ({ count: 0 }),
      },
      organization: { findUnique: async () => ({ enabledModules: [] }) },
      $transaction: async (ops: any[]) => Promise.all(ops),
    };
    const cache: any = { invalidate: async () => {} };
    return new WorkflowsService(prisma, cache);
  };

  it('lets a space offer an organization-wide task type', async () => {
    const svc = makeService();
    await svc.attachSpaceWorkflow({ spaceId: 'sp-b', workflowId: 'wf-shared', organizationId: ORG });
    expect(upserts).toHaveLength(1);
  });

  it('lets a space offer its own local task type', async () => {
    const svc = makeService();
    await svc.attachSpaceWorkflow({ spaceId: 'sp-a', workflowId: 'wf-local-a', organizationId: ORG });
    expect(upserts).toHaveLength(1);
  });

  it("refuses another space's local task type, and says what to do instead", async () => {
    const svc = makeService();
    await expect(
      svc.attachSpaceWorkflow({ spaceId: 'sp-b', workflowId: 'wf-local-a', organizationId: ORG }),
    ).rejects.toThrow(BadRequestException);
    expect(upserts).toHaveLength(0);
  });
});

/**
 * The organization default is the fallback for anything with no other answer,
 * so it has to be a type every space could actually use.
 */
describe('setDefault — a local task type cannot become the organization default', () => {
  const ORG = 'org-1';

  const makeService = (ownerSpaceId: string | null) => {
    const prisma: any = {
      statusWorkflow: {
        findUnique: async () => ({ id: 'wf-1', organizationId: ORG, ownerSpaceId }),
        update: async () => ({}),
        updateMany: async () => ({ count: 0 }),
      },
      $transaction: async (ops: any[]) => Promise.all(ops),
    };
    return new WorkflowsService(prisma, { invalidate: async () => {} } as any);
  };

  it('refuses one scoped to a single space', async () => {
    await expect(makeService('sp-a').setDefault({ id: 'wf-1', organizationId: ORG })).rejects.toThrow(BadRequestException);
  });

  it('allows an organization-wide one', async () => {
    await expect(makeService(null).setDefault({ id: 'wf-1', organizationId: ORG })).resolves.toBeTruthy();
  });
});

/**
 * Deleting a task type must not empty a space's default.
 *
 * SpaceWorkflow cascades on delete, so removing the type takes the offering row
 * with it and the space is left with no default at all — new tasks there fall
 * back to whatever the legacy column still says, silently. Detaching already
 * refused this; deleting had to as well, or the guard is one somebody routes
 * around without meaning to.
 */
describe('remove — a space keeps its default', () => {
  const ORG = 'org-1';

  const makeService = (isDefaultSomewhere: boolean, taskCount = 0) => {
    const prisma: any = {
      statusWorkflow: {
        findUnique: async () => ({
          id: 'wf-1', organizationId: ORG, isDefault: false, ownerSpaceId: null,
          _count: { tasks: taskCount },
        }),
        delete: async () => ({}),
      },
      spaceWorkflow: {
        findFirst: async () => (isDefaultSomewhere ? { space: { name: 'Warehouse' } } : null),
      },
    };
    return new WorkflowsService(prisma, { invalidate: async () => {} } as any);
  };

  it("refuses while it is a space's default, and names the space", async () => {
    await expect(makeService(true).remove({ id: 'wf-1', organizationId: ORG })).rejects.toThrow(/Warehouse/);
  });

  it('allows one no space depends on', async () => {
    await expect(makeService(false).remove({ id: 'wf-1', organizationId: ORG })).resolves.toBeTruthy();
  });

  it('still refuses one that has tasks, before it even looks at defaults', async () => {
    await expect(makeService(false, 3).remove({ id: 'wf-1', organizationId: ORG })).rejects.toThrow(/task/i);
  });
});

/**
 * Deleting a step must delete every route TO it.
 *
 * It used to delete only the row, leaving siblings pointing at a key that no
 * longer existed. Invisible until the validator arrived, then fatal: a dangling
 * target is an unknown_transition, so ONE deletion refused the whole task type
 * the next time anyone tried to offer it. A real database already had a flow
 * broken this way — a Cancelled step removed, every route to it left behind.
 */
describe('removeStatus — routes to the deleted step go with it', () => {
  const ORG = 'org-1';

  const makeService = (rows: { id: string; key: string; transitions: string[] }[], taskCount = 0) => {
    const deleted: string[] = [];
    const updated: { id: string; transitions: string[] }[] = [];
    const prisma: any = {
      statusWorkflow: { findUnique: async () => ({ id: 'wf-1', organizationId: ORG }) },
      workflowStatus: {
        findUnique: async ({ where }: any) => {
          const r = rows.find((x) => x.id === where.id);
          return r ? { ...r, workflowId: 'wf-1', name: r.key } : null;
        },
        findMany: async ({ where }: any) =>
          rows.filter((r) => r.transitions.includes(where.transitions.has) && !deleted.includes(r.id)),
        delete: async ({ where }: any) => { deleted.push(where.id); return {}; },
        update: async ({ where, data }: any) => { updated.push({ id: where.id, transitions: data.transitions }); return {}; },
      },
      task: { count: async () => taskCount },
      $transaction: async (fn: any) => fn(prisma),
    };
    const svc = new WorkflowsService(prisma, { invalidate: async () => {} } as any);
    return { svc, deleted, updated };
  };

  it('strips the deleted key from every sibling that pointed at it', async () => {
    const { svc, deleted, updated } = makeService([
      { id: 's1', key: 'OPEN', transitions: ['DOING', 'CANCELED'] },
      { id: 's2', key: 'DOING', transitions: ['DONE', 'CANCELED'] },
      { id: 's3', key: 'CANCELED', transitions: [] },
    ]);
    await svc.removeStatus({ workflowId: 'wf-1', statusId: 's3', organizationId: ORG });

    expect(deleted).toEqual(['s3']);
    expect(updated).toEqual([
      { id: 's1', transitions: ['DOING'] },
      { id: 's2', transitions: ['DONE'] },
    ]);
  });

  it('leaves siblings alone when nothing pointed at the deleted step', async () => {
    // A step nothing routes to — removing it changes no other row.
    const { svc, deleted, updated } = makeService([
      { id: 's1', key: 'OPEN', transitions: ['DONE'] },
      { id: 's2', key: 'ORPHAN', transitions: [] },
      { id: 's3', key: 'DONE', transitions: [] },
    ]);
    await svc.removeStatus({ workflowId: 'wf-1', statusId: 's2', organizationId: ORG });
    expect(deleted).toEqual(['s2']);
    expect(updated).toEqual([]);
  });

  it('still refuses to delete a step tasks are sitting in', async () => {
    const { svc, deleted } = makeService([{ id: 's1', key: 'OPEN', transitions: [] }], 4);
    await expect(
      svc.removeStatus({ workflowId: 'wf-1', statusId: 's1', organizationId: ORG }),
    ).rejects.toThrow(/task/i);
    expect(deleted).toEqual([]);
  });
});
