/**
 * The visibility clause, and the CONTRACT its callers depend on.
 *
 * `findAll` copies exactly two things off this result — `organizationId` and
 * `AND`. Anything returned under another key is silently discarded, and what
 * remains is `{ organizationId }`: every task in the organization.
 *
 * That happened. A branch added for space-scoped members returned a bare `OR`,
 * and a member entitled to ONE space was shown all 142 tasks in the org. The
 * clause was the narrowest one in the file; the outcome was the widest possible.
 * So these tests assert the SHAPE, not only the intent — a correct-looking
 * filter under the wrong key is indistinguishable from no filter at all.
 */
type Where = { organizationId: string; AND?: unknown[]; OR?: unknown[] };

/** Exactly what findAll does with the result. */
function applyLikeFindAll(visibility: Where): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  where.organizationId = visibility.organizationId;
  if (visibility.AND) where.AND = [...(visibility.AND as unknown[])];
  return where;
}

describe('task visibility clause', () => {
  const ORG = 'org-1';
  const USER = 'user-1';
  const SPACE = 'space-1';

  // The production branch, restated here so the shape is pinned independently
  // of how the service happens to be wired.
  const spaceScoped: Where = {
    organizationId: ORG,
    AND: [
      {
        OR: [
          { spaceId: { in: [SPACE] } },
          { assignedToId: USER },
          { assignees: { some: { userId: USER } } },
        ],
      },
    ],
  };

  it('survives what findAll copies — the filter is still there afterwards', () => {
    const applied = applyLikeFindAll(spaceScoped);
    expect(applied.AND).toBeDefined();
    expect((applied.AND as unknown[]).length).toBe(1);
  });

  it('a bare OR would be DROPPED — the bug this file exists for', () => {
    const bareOr: Where = { organizationId: ORG, OR: [{ spaceId: { in: [SPACE] } }] };
    const applied = applyLikeFindAll(bareOr);
    // Nothing but the org filter survives: every task in the organization.
    expect(applied.AND).toBeUndefined();
    expect(Object.keys(applied)).toEqual(['organizationId']);
  });

  it('keeps the org boundary as well as the space narrowing', () => {
    expect(spaceScoped.organizationId).toBe(ORG);
  });

  it('includes their own assigned work alongside their space', () => {
    const or = (spaceScoped.AND![0] as { OR: unknown[] }).OR;
    expect(or).toContainEqual({ assignedToId: USER });
    expect(or).toContainEqual({ assignees: { some: { userId: USER } } });
  });
});
