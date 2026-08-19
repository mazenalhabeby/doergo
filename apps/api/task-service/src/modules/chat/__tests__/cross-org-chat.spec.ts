import { resolveCrossOrgChatSpace, isCrossOrgConversationLive, type ChatShareFacts, type ChatParty } from '@hbcfield/shared';

const OWNER = 'org-owner';
const GUEST = 'org-guest';
const SPACE = 'space-1';

const party = (over: Partial<ChatParty> = {}): ChatParty => ({
  userId: 'u-a',
  organizationId: OWNER,
  role: 'EMPLOYEE',
  spaceIds: [SPACE],
  ...over,
});
const share = (over: Partial<ChatShareFacts> = {}): ChatShareFacts => ({
  spaceId: SPACE,
  ownerOrgId: OWNER,
  guestOrgId: GUEST,
  status: 'ACTIVE',
  showWorkers: true,
  expiresAt: null,
  ...over,
});

const owner = party();
const guest = party({ userId: 'u-b', organizationId: GUEST });

describe('resolveCrossOrgChatSpace', () => {
  it('authorizes two people working the same shared space', () => {
    expect(resolveCrossOrgChatSpace(owner, guest, [share()])).toBe(SPACE);
  });

  it('works in either direction — owner-side or guest-side caller', () => {
    expect(resolveCrossOrgChatSpace(guest, owner, [share()])).toBe(SPACE);
  });

  it('refuses once the share is revoked', () => {
    expect(resolveCrossOrgChatSpace(owner, guest, [share({ status: 'REVOKED' })])).toBeNull();
  });

  it('refuses a share still pending acceptance', () => {
    expect(resolveCrossOrgChatSpace(owner, guest, [share({ status: 'PENDING' })])).toBeNull();
  });

  it('refuses when the owner has not exposed workers', () => {
    expect(resolveCrossOrgChatSpace(owner, guest, [share({ showWorkers: false })])).toBeNull();
  });

  it('refuses an expired share', () => {
    const expired = share({ expiresAt: new Date('2020-01-01') });
    expect(resolveCrossOrgChatSpace(owner, guest, [expired], { now: new Date('2026-01-01') })).toBeNull();
  });

  it('honours a share that has not expired yet', () => {
    const future = share({ expiresAt: new Date('2030-01-01') });
    expect(resolveCrossOrgChatSpace(owner, guest, [future], { now: new Date('2026-01-01') })).toBe(SPACE);
  });

  it('refuses when only one side works the space', () => {
    // Seeing a shared space is not licence to message the people in it.
    expect(resolveCrossOrgChatSpace(owner, party({ userId: 'u-b', organizationId: GUEST, spaceIds: [] }), [share()])).toBeNull();
    expect(resolveCrossOrgChatSpace(party({ spaceIds: [] }), guest, [share()])).toBeNull();
  });

  it('refuses a share between two other organizations', () => {
    expect(resolveCrossOrgChatSpace(owner, guest, [share({ guestOrgId: 'org-third' })])).toBeNull();
  });

  it('refuses when both are in the same org — that is the in-org rule', () => {
    expect(resolveCrossOrgChatSpace(owner, party({ userId: 'u-b' }), [share()])).toBeNull();
  });

  it('never involves an external customer account', () => {
    expect(resolveCrossOrgChatSpace(owner, party({ userId: 'u-b', organizationId: GUEST, role: 'CUSTOMER' }), [share()])).toBeNull();
    expect(resolveCrossOrgChatSpace(party({ role: 'CUSTOMER' }), guest, [share()])).toBeNull();
  });

  it('refuses with no shares at all', () => {
    expect(resolveCrossOrgChatSpace(owner, guest, [])).toBeNull();
  });

  it('keeps an existing anchor when it still qualifies', () => {
    const other = share({ spaceId: 'space-2' });
    const both = [other, share()];
    const a = party({ spaceIds: [SPACE, 'space-2'] });
    const b = party({ userId: 'u-b', organizationId: GUEST, spaceIds: [SPACE, 'space-2'] });
    // Without a preference the first qualifying share wins...
    expect(resolveCrossOrgChatSpace(a, b, both)).toBe('space-2');
    // ...but an existing anchor is kept, so a live thread doesn't migrate.
    expect(resolveCrossOrgChatSpace(a, b, both, { preferSpaceId: SPACE })).toBe(SPACE);
  });

  it('falls back to another share when the preferred one died', () => {
    const dead = share({ status: 'REVOKED' });
    const alive = share({ spaceId: 'space-2' });
    const a = party({ spaceIds: [SPACE, 'space-2'] });
    const b = party({ userId: 'u-b', organizationId: GUEST, spaceIds: [SPACE, 'space-2'] });
    expect(resolveCrossOrgChatSpace(a, b, [dead, alive], { preferSpaceId: SPACE })).toBe('space-2');
  });
});

describe('isCrossOrgConversationLive', () => {
  it('stays open while its own share is active', () => {
    expect(isCrossOrgConversationLive(SPACE, owner, guest, [share()])).toBe(true);
  });

  it('freezes the moment its share is revoked', () => {
    // The requirement: history remains, new messages do not.
    expect(isCrossOrgConversationLive(SPACE, owner, guest, [share({ status: 'REVOKED' })])).toBe(false);
  });

  it('freezes when a party is unassigned from the space', () => {
    const removed = party({ userId: 'u-b', organizationId: GUEST, spaceIds: [] });
    expect(isCrossOrgConversationLive(SPACE, owner, removed, [share()])).toBe(false);
  });

  it('does NOT stay open on the strength of a different share', () => {
    // Another live share between the same orgs must not silently keep a
    // conversation alive whose own reason has gone.
    const dead = share({ status: 'REVOKED' });
    const elsewhere = share({ spaceId: 'space-2' });
    const a = party({ spaceIds: [SPACE, 'space-2'] });
    const b = party({ userId: 'u-b', organizationId: GUEST, spaceIds: [SPACE, 'space-2'] });
    expect(isCrossOrgConversationLive(SPACE, a, b, [dead, elsewhere])).toBe(false);
  });

  it('refuses without an anchor', () => {
    expect(isCrossOrgConversationLive('', owner, guest, [share()])).toBe(false);
  });
});
