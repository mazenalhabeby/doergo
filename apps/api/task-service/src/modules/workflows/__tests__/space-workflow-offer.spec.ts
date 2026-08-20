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
