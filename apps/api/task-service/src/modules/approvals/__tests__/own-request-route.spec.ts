import { askAboutOwnRequest } from '../own-request-route';

/*
  Who is asked about a request somebody makes about their OWN time.
  Patrick led Binderholz alone; his extra time went to nobody, because the only
  leader there was himself and nobody approves their own.
*/
const ADMIN_ROW = { role: 'ADMIN', memberRole: null, spaceAssignments: [] };
const MEMBER_ROW = { role: 'EMPLOYEE', memberRole: null, spaceAssignments: [{ spaceId: 'binderholz', role: { isActive: true, permissions: {} } }] };
const LEADER_ROW = { role: 'EMPLOYEE', memberRole: null, spaceAssignments: [{ spaceId: 'binderholz', role: { isActive: true, permissions: { canApproveOvertime: true, canManageRota: true } } }] };

function prismaWith(subject: object | null, adminIds: string[]) {
  return {
    user: {
      findFirst: jest.fn().mockResolvedValue(subject),
      findMany: jest.fn().mockResolvedValue(adminIds.map((id) => ({ id }))),
    },
  };
}
const base = { organizationId: 'org', subjectId: 'patrick', spaceIds: ['binderholz'] };

describe('who is asked about my own request', () => {
  it('a member: the usual people, never the member', async () => {
    const r = await askAboutOwnRequest(prismaWith(MEMBER_ROW, ['anna']), { ...base, kind: 'extraTime', usual: ['lead', 'patrick'] });
    expect(r).toEqual({ route: 'USUAL', ids: ['lead'] });
  });

  it('a leader: the administrators — not "nobody" because they lead the workspace alone', async () => {
    const r = await askAboutOwnRequest(prismaWith(LEADER_ROW, ['anna', 'john']), { ...base, kind: 'extraTime', usual: ['patrick'] });
    expect(r).toEqual({ route: 'ADMINS', ids: ['anna', 'john'] });
  });

  it('the same for leave, a remote day, other hours: every request a leader makes', async () => {
    const r = await askAboutOwnRequest(prismaWith(LEADER_ROW, ['anna']), { ...base, kind: 'request', usual: [] });
    expect(r).toEqual({ route: 'ADMINS', ids: ['anna'] });
  });

  it('a leader somewhere else is a member here', async () => {
    const r = await askAboutOwnRequest(prismaWith(LEADER_ROW, ['anna']), { ...base, spaceIds: ['office'], kind: 'extraTime', usual: ['lead'] });
    expect(r.route).toBe('USUAL');
  });

  it('an administrator with other administrators: they are asked', async () => {
    const r = await askAboutOwnRequest(prismaWith(ADMIN_ROW, ['anna']), { ...base, kind: 'request', usual: ['x'] });
    expect(r).toEqual({ route: 'ADMINS', ids: ['anna'] });
  });

  it('the only administrator: approved automatically, nobody asked', async () => {
    const r = await askAboutOwnRequest(prismaWith(ADMIN_ROW, []), { ...base, kind: 'extraTime', usual: ['x'] });
    expect(r).toEqual({ route: 'AUTOMATIC', ids: [] });
  });

  it('other administrators are looked up without the subject, internal and active only', async () => {
    const prisma = prismaWith(LEADER_ROW, ['anna']);
    await askAboutOwnRequest(prisma, { ...base, kind: 'extraTime', usual: [] });
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({ role: 'ADMIN', isActive: true, isExternal: false, id: { not: 'patrick' } });
  });
});
