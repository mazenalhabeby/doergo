import { resolveSpaceDefaultWorkflowId, listSpaceWorkflowIds } from '../../../common/space-workflow.util';

/**
 * Moving a space's workflow from a column to a join table, without anyone
 * noticing.
 *
 * Four places resolved this independently, each reading
 * CompanyLocation.workflowId. They now share one resolver that prefers the
 * SpaceWorkflow join and falls back to the column — so during the migration
 * both are populated and agree, and afterwards the column can be dropped
 * without touching a caller.
 *
 * The property that makes the release invisible: for every space that exists
 * today, the answer is the same before and after.
 */
describe('resolving a space default workflow', () => {
  const makePrisma = (opts: { rows?: any[]; column?: string | null }) => {
    const rows = opts.rows ?? [];
    const calls: string[] = [];
    const prisma: any = {
      spaceWorkflow: {
        findFirst: async ({ where }: any) => {
          calls.push('join');
          return rows.find((r) => r.spaceId === where.spaceId && r.isDefault === where.isDefault) ?? null;
        },
        findMany: async ({ where }: any) => {
          calls.push('joinMany');
          return rows
            .filter((r) => r.spaceId === where.spaceId)
            .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.position - b.position);
        },
      },
      companyLocation: {
        findUnique: async () => {
          calls.push('column');
          return opts.column === undefined ? null : { workflowId: opts.column };
        },
      },
    };
    return { prisma, calls };
  };

  it('prefers the space offering marked default', async () => {
    const { prisma } = makePrisma({
      rows: [{ spaceId: 'sp', workflowId: 'wf-join', isDefault: true, position: 0 }],
      column: 'wf-column',
    });
    expect(await resolveSpaceDefaultWorkflowId(prisma, 'sp')).toBe('wf-join');
  });

  it('does not read the column at all once an offering exists', async () => {
    const { prisma, calls } = makePrisma({
      rows: [{ spaceId: 'sp', workflowId: 'wf-join', isDefault: true, position: 0 }],
      column: 'wf-column',
    });
    await resolveSpaceDefaultWorkflowId(prisma, 'sp');
    expect(calls).toEqual(['join']);
  });

  it('falls back to the column for a space with no offerings', async () => {
    // A space created before the join existed, or one whose offerings were all
    // removed. This is what makes the release invisible.
    const { prisma } = makePrisma({ rows: [], column: 'wf-column' });
    expect(await resolveSpaceDefaultWorkflowId(prisma, 'sp')).toBe('wf-column');
  });

  it('returns null when neither has one — the canonical machine applies', async () => {
    const { prisma } = makePrisma({ rows: [], column: null });
    expect(await resolveSpaceDefaultWorkflowId(prisma, 'sp')).toBeNull();
  });

  it('returns null without querying anything when there is no space', async () => {
    const { prisma, calls } = makePrisma({ rows: [], column: 'wf-column' });
    expect(await resolveSpaceDefaultWorkflowId(prisma, null)).toBeNull();
    expect(await resolveSpaceDefaultWorkflowId(prisma, undefined)).toBeNull();
    expect(calls).toEqual([]);
  });

  it('ignores an offering that is not the default', async () => {
    // Phase 3 adds several per space; only one of them is what a new task
    // inherits.
    const { prisma } = makePrisma({
      rows: [{ spaceId: 'sp', workflowId: 'wf-other', isDefault: false, position: 0 }],
      column: 'wf-column',
    });
    expect(await resolveSpaceDefaultWorkflowId(prisma, 'sp')).toBe('wf-column');
  });

  describe('listSpaceWorkflowIds', () => {
    it('lists offerings default first, then by position', async () => {
      const { prisma } = makePrisma({
        rows: [
          { spaceId: 'sp', workflowId: 'wf-c', isDefault: false, position: 2 },
          { spaceId: 'sp', workflowId: 'wf-a', isDefault: true, position: 9 },
          { spaceId: 'sp', workflowId: 'wf-b', isDefault: false, position: 1 },
        ],
        column: null,
      });
      expect(await listSpaceWorkflowIds(prisma, 'sp')).toEqual(['wf-a', 'wf-b', 'wf-c']);
    });

    it('describes the column as a single offering while none exist', async () => {
      // Today's behaviour, expressed in tomorrow's shape — which is why turning
      // this on changes nothing on screen.
      const { prisma } = makePrisma({ rows: [], column: 'wf-column' });
      expect(await listSpaceWorkflowIds(prisma, 'sp')).toEqual(['wf-column']);
    });

    it('is empty for a space with no workflow anywhere', async () => {
      const { prisma } = makePrisma({ rows: [], column: null });
      expect(await listSpaceWorkflowIds(prisma, 'sp')).toEqual([]);
    });
  });
});
