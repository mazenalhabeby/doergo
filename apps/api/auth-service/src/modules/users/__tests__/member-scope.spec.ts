import { ForbiddenException } from '@nestjs/common';
import { assertMemberInScope, memberScopeFilter } from '@hbcfield/shared';

/**
 * "View all tasks" held by a SPACE role means that space's work — and its
 * people. Every per-member read takes a member id straight from the caller, so
 * the guard cannot decide it: at guard time all that is known is that the
 * caller holds the permission SOMEWHERE. This is the boundary.
 *
 * The three states matter more than the happy path. `[]` — granted nowhere —
 * must match NOTHING; treating it as "unset" turns a member granted nothing
 * into an org-wide reader, which is the failure this scoping exists to prevent
 * and which this codebase has shipped before.
 */
describe('reading one member', () => {
  const found = { spaceAssignment: { findFirst: jest.fn().mockResolvedValue({ id: 'sa1' }) } };
  const none = { spaceAssignment: { findFirst: jest.fn().mockResolvedValue(null) } };
  beforeEach(() => { found.spaceAssignment.findFirst.mockClear(); none.spaceAssignment.findFirst.mockClear(); });

  it('asks nothing of an org-wide caller — no query at all', async () => {
    await expect(assertMemberInScope(found, { userId: 'u1', organizationId: 'o1' })).resolves.toBeUndefined();
    expect(found.spaceAssignment.findFirst).not.toHaveBeenCalled();
  });

  it('refuses a caller granted nowhere, without querying', async () => {
    await expect(
      assertMemberInScope(found, { userId: 'u1', organizationId: 'o1', scopeSpaceIds: [] }),
    ).rejects.toThrow(ForbiddenException);
    expect(found.spaceAssignment.findFirst).not.toHaveBeenCalled();
  });

  it('allows a member rostered in one of the caller’s spaces', async () => {
    await expect(
      assertMemberInScope(found, { userId: 'u1', organizationId: 'o1', scopeSpaceIds: ['s1'] }),
    ).resolves.toBeUndefined();
  });

  it('refuses a member who is not', async () => {
    await expect(
      assertMemberInScope(none, { userId: 'u1', organizationId: 'o1', scopeSpaceIds: ['s1'] }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('scopes the lookup by organization as well as space', async () => {
    // The org scope is what stops a guessed member id reaching across tenants
    // even when the space id is otherwise valid.
    await assertMemberInScope(found, { userId: 'u1', organizationId: 'o1', scopeSpaceIds: ['s1'] });
    const where = found.spaceAssignment.findFirst.mock.calls[0][0].where;
    expect(where.organizationId).toBe('o1');
    expect(where.spaceId).toEqual({ in: ['s1'] });
  });

  it('ignores a membership that has ended', async () => {
    await assertMemberInScope(found, { userId: 'u1', organizationId: 'o1', scopeSpaceIds: ['s1'] });
    const where = found.spaceAssignment.findFirst.mock.calls[0][0].where;
    // Somebody who left the site last year is not in this crew.
    expect(where.OR).toEqual([{ effectiveTo: null }, { effectiveTo: { gte: expect.any(Date) } }]);
  });
});

describe('listing members', () => {
  it('adds nothing for an org-wide caller', () => {
    expect(memberScopeFilter(undefined)).toEqual({});
  });

  it('narrows through the roster, in the query', () => {
    // In the WHERE, not applied to the page: this read is counted and paged, so
    // filtering afterwards would leave `total` describing a different set.
    const f = memberScopeFilter(['s1', 's2']) as any;
    expect(f.spaceAssignments.some.spaceId).toEqual({ in: ['s1', 's2'] });
  });

  it('an empty grant matches nothing rather than everything', () => {
    const f = memberScopeFilter([]) as any;
    expect(f.spaceAssignments.some.spaceId).toEqual({ in: [] });
    expect(f).not.toEqual({});
  });
});
