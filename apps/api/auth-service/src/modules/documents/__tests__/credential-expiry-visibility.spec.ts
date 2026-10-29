import { CredentialExpiryService } from '../registers/credential-expiry.service';

/*
  An expiry reminder names the person, the credential and its date. It went to
  every administrator and legacy-flag holder whatever the type's
  visibleToRoleIds or the document's own override said — telling exactly the
  people the restriction hides it from. Recipients now pass the same visibility
  rule as every read; administrators always see it.
*/
describe('credential expiry reminders reach only who may see the document', () => {
  const NOW = new Date('2026-08-29T02:00:00Z');
  const notifications = { emit: jest.fn() };
  const owners = [
    { id: 'u-admin', role: 'ADMIN', memberRoleId: null },
    { id: 'u-hr', role: 'MANAGER', memberRoleId: 'role-hr' },
    { id: 'u-dispatch', role: 'MANAGER', memberRoleId: 'role-dispatch' },
  ];
  const prisma: any = { document: { findMany: jest.fn() }, user: { findMany: jest.fn(async () => owners) } };
  const service = new CredentialExpiryService(prisma, notifications as any);

  const doc = (over: Record<string, unknown>) => ({
    id: 'd1',
    title: 'Work permit',
    expiresOn: new Date(Date.UTC(2026, 7, 29 + 30)),
    organizationId: 'org1',
    userId: 'u-mike',
    rolesOverridden: false,
    visibleToRoleIds: [],
    user: { id: 'u-mike', firstName: 'Mike', lastName: 'Weber', email: 'mike@example.com' },
    type: { label: 'Work permit', visibleToRoleIds: [] },
    ...over,
  });
  const recipients = () => notifications.emit.mock.calls[0][1].recipientIds;

  beforeEach(() => jest.clearAllMocks());

  it('an unrestricted type still reaches every roster owner', async () => {
    prisma.document.findMany.mockResolvedValue([doc({})]);
    await service.sendReminders(NOW);
    expect(recipients()).toEqual(['u-admin', 'u-hr', 'u-dispatch']);
  });

  it('a type restricted to HR reaches HR and the administrators, not dispatch', async () => {
    prisma.document.findMany.mockResolvedValue([
      doc({ type: { label: 'Work permit', visibleToRoleIds: ['role-hr'] } }),
    ]);
    await service.sendReminders(NOW);
    expect(recipients()).toEqual(['u-admin', 'u-hr']);
  });

  it("a document's own override (administrators only) wins over the type", async () => {
    prisma.document.findMany.mockResolvedValue([doc({ rolesOverridden: true, visibleToRoleIds: [] })]);
    await service.sendReminders(NOW);
    expect(recipients()).toEqual(['u-admin']);
  });
});
