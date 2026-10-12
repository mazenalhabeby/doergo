import { EventsService } from '../events.service';

/**
 * A client on an event is shown only to a viewer who can REACH that client
 * under the CRM's own rule. "Reads the client book" was the whole test, so a
 * rep with own-scope CRM, invited by another rep, read the name of a client
 * that is not theirs.
 */
describe('calendar event: whose client is shown', () => {
  const client = { id: 'c1', name: 'BILLA AG', ownerId: 'rep-a', managerIds: ['rep-c'] };
  const event = (userId: string) => ({
    id: 'e1', kind: 'APPOINTMENT', title: 'Visit', description: null, location: null, meetingUrl: null,
    startAt: new Date('2027-03-01T10:00:00Z'), endAt: new Date('2027-03-01T11:00:00Z'), allDay: false,
    timezone: 'Europe/Vienna', repeat: null, reminderOffsets: [], visibility: 'NORMAL', canceledAt: null,
    space: null, customer: client, createdById: 'rep-a',
    meetingMode: null, placeKind: null, placeSpace: null, room: null, phone: null, callDirection: null,
    attendees: [
      { userId: 'rep-a', response: 'ACCEPTED', isOrganizer: true, user: { firstName: 'A', lastName: 'A', avatarUrl: null } },
      { userId, response: 'PENDING', isOrganizer: false, user: { firstName: 'B', lastName: 'B', avatarUrl: null } },
    ],
  });
  const make = (userId: string, perms: Record<string, boolean>, spaceAssignments: any[] = [], customer: any = client) => {
    const prisma: any = {
      calendarEvent: { findFirst: jest.fn().mockResolvedValue({ ...event(userId), customer }) },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          role: 'EMPLOYEE', organizationId: 'org', isExternal: false,
          organization: { enabledModules: ['crm'] },
          memberRole: { permissions: perms, isActive: true },
          spaceAssignments,
        }),
      },
    };
    return new EventsService(prisma, {} as any, { emit: jest.fn() } as any);
  };
  const read = async (userId: string, perms: Record<string, boolean>, crm = true, spaces: any[] = [], customer: any = client) =>
    ((await make(userId, perms, spaces, customer).get({ userId, organizationId: 'org', role: 'EMPLOYEE', crm, eventId: 'e1' })) as any).data.customer;

  it('own-scope CRM: another rep’s client is hidden', async () => {
    expect(await read('rep-b', { crmViewOwn: true })).toBeNull();
  });

  it('own-scope CRM: their own client, or one they co-manage, is shown', async () => {
    expect(await read('rep-a', { crmViewOwn: true })).toEqual({ id: 'c1', name: 'BILLA AG' });
    expect(await read('rep-c', { crmViewOwn: true })).toEqual({ id: 'c1', name: 'BILLA AG' });
  });

  it('whole-book CRM sees it; no CRM sees nothing', async () => {
    expect(await read('rep-b', { crmViewAll: true })).toEqual({ id: 'c1', name: 'BILLA AG' });
    expect(await read('rep-b', { crmViewAll: true }, false)).toBeNull();
  });

  /*
    A CRM grant held in ONE workspace reads that workspace's clients only — the
    client's own workspace decides, and a client filed nowhere answers to
    org-wide grants alone.
  */
  it('a workspace CRM grant shows a client filed in that workspace, not another or none', async () => {
    const inS1 = [{ spaceId: 's1', role: { permissions: { crmViewAll: true }, isActive: true }, space: { organizationId: 'org', isActive: true, enabledModules: null } }];
    expect(await read('rep-b', {}, true, inS1, { ...client, spaceId: 's1' })).toEqual({ id: 'c1', name: 'BILLA AG' });
    expect(await read('rep-b', {}, true, inS1, { ...client, spaceId: 's2' })).toBeNull();
    expect(await read('rep-b', {}, true, inS1, { ...client, spaceId: null })).toBeNull();
  });

  it('a space role\'s canViewAllTasks is not a CRM grant', async () => {
    const supervisor = [{ spaceId: 's1', role: { permissions: { canViewAllTasks: true, canManageUsers: true }, isActive: true }, space: { organizationId: 'org', isActive: true, enabledModules: null } }];
    expect(await read('rep-b', {}, true, supervisor, { ...client, spaceId: 's1' })).toBeNull();
  });
});
