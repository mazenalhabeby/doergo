import {
  crmReachOf,
  crmReachOfRow,
  crmCapsIn,
  crmCapsAnywhere,
  crmCreateScope,
  crmReachWhere,
  crmReachesClientIn,
  resolveCrmCaps,
  type CrmReachRow,
} from '@hbcfield/shared';

/*
  The CRM reach — org-wide caps, plus per-workspace caps — as a pure rule
  (packages/shared/src/crm/crm-reach.ts + client-reach.ts).

  The hazards, in the order they would hurt:
    1. A workspace's canViewAllTasks / canManageUsers read as CRM: every space
       manager and every external supervisor handed that workspace's book.
    2. A workspace grant reaching past its walls — into another workspace, or
       into the clients filed in none.
    3. An external member holding anything org-wide.
    4. A grant counted in a workspace that does not run the CRM.
*/

const access = (org: Record<string, boolean>, perSpace: Record<string, Record<string, boolean>> = {}) => ({ org, perSpace });

describe('crm reach — building it', () => {
  it('keeps the org-wide legacy bridge (existing managers keep their book)', () => {
    const reach = crmReachOf('EMPLOYEE', access({ canViewAllTasks: true }), { crmSpaces: [] });
    expect(reach.org.view).toBe('all');
  });

  it('a workspace role\'s canViewAllTasks / canManageUsers grant NO CRM there', () => {
    const reach = crmReachOf('EMPLOYEE', access({}, { s1: { canViewAllTasks: true, canManageUsers: true } }), { crmSpaces: ['s1'] });
    expect(reach.spaces.s1).toBeUndefined();
    expect(crmCapsAnywhere(reach).canAccess).toBe(false);
  });

  it('a workspace role\'s crm* keys grant CRM in that workspace only', () => {
    const reach = crmReachOf('EMPLOYEE', access({}, { s1: { crmViewAll: true, crmEditInfo: true } }), { crmSpaces: ['s1', 's2'] });
    expect(crmCapsIn(reach, 's1')).toMatchObject({ view: 'all', editInfo: true });
    expect(crmCapsIn(reach, 's2').canAccess).toBe(false);
    expect(crmCapsIn(reach, null).canAccess).toBe(false);
  });

  it('a workspace that does not run the CRM grants nothing', () => {
    const reach = crmReachOf('EMPLOYEE', access({}, { s1: { crmViewAll: true } }), { crmSpaces: [] });
    expect(crmCapsIn(reach, 's1').canAccess).toBe(false);
  });

  it('an external member holds nothing org-wide, whatever the row says', () => {
    const reach = crmReachOf('EMPLOYEE', access({ crmViewAll: true, canManageUsers: true }, { s1: { crmViewOwn: true } }), {
      crmSpaces: ['s1'],
      isExternal: true,
    });
    expect(reach.org.canAccess).toBe(false);
    expect(crmCapsIn(reach, 's1').view).toBe('own');
  });

  it('a client gets org ∪ ITS workspace', () => {
    const reach = crmReachOf('EMPLOYEE', access({ crmViewOwn: true }, { s1: { crmViewAll: true, crmManageClients: true } }), { crmSpaces: ['s1'] });
    expect(crmCapsIn(reach, 's1')).toMatchObject({ view: 'all', manage: true });
    expect(crmCapsIn(reach, 's2')).toMatchObject({ view: 'own', manage: false });
  });

  it('resolveCrmCaps without the bridge ignores the two legacy keys', () => {
    expect(resolveCrmCaps(null, { canManageUsers: true, canViewAllTasks: true }, { legacyBridge: false }).canAccess).toBe(false);
    expect(resolveCrmCaps(null, { canManageUsers: true }).manage).toBe(true);
  });
});

describe('crm reach — which clients', () => {
  const rep = crmReachOf('EMPLOYEE', access({}, { s1: { crmViewAll: true }, s2: { crmViewOwn: true } }), { crmSpaces: ['s1', 's2'] });

  it('view-all in a workspace reaches every client filed there', () => {
    expect(crmReachesClientIn(rep, { spaceId: 's1', ownerId: 'x', managerIds: [] }, 'me')).toBe(true);
  });

  it('view-own in a workspace reaches only the clients there they own or co-manage', () => {
    expect(crmReachesClientIn(rep, { spaceId: 's2', ownerId: 'x', managerIds: [] }, 'me')).toBe(false);
    expect(crmReachesClientIn(rep, { spaceId: 's2', ownerId: 'x', managerIds: ['me'] }, 'me')).toBe(true);
  });

  it('nothing outside those workspaces — another one, or none', () => {
    expect(crmReachesClientIn(rep, { spaceId: 's3', ownerId: 'me', managerIds: [] }, 'me')).toBe(false);
    expect(crmReachesClientIn(rep, { spaceId: null, ownerId: 'me', managerIds: [] }, 'me')).toBe(false);
  });

  it('the where says the same thing as the single-record check', () => {
    expect(crmReachWhere(rep, 'me')).toEqual({
      OR: [
        { spaceId: { in: ['s1'] } },
        { spaceId: { in: ['s2'] }, OR: [{ ownerId: 'me' }, { managerIds: { has: 'me' } }] },
      ],
    });
  });

  it('org-wide view-all is every client; nobody reaches nothing', () => {
    expect(crmReachWhere(crmReachOf('ADMIN', null, { crmSpaces: [] }), 'me')).toEqual({});
    expect(crmReachWhere(crmReachOf('EMPLOYEE', access({}), { crmSpaces: [] }), 'me')).toEqual({ id: { in: [] } });
  });

  it('create scope: org-wide is anywhere, a workspace grant only there', () => {
    const r = crmReachOf('EMPLOYEE', access({}, { s1: { crmCreateClients: true }, s2: { crmViewAll: true } }), { crmSpaces: ['s1', 's2'] });
    expect(crmCreateScope(r)).toEqual({ anywhere: false, spaceIds: ['s1'] });
  });
});

describe('crm reach — from the database row', () => {
  const row = (over: Partial<CrmReachRow> = {}): CrmReachRow => ({
    role: 'EMPLOYEE',
    organizationId: 'org',
    isExternal: false,
    organization: { enabledModules: ['crm'] },
    memberRole: null,
    spaceAssignments: [],
    ...over,
  });
  const assigned = (spaceId: string, permissions: Record<string, boolean>, space: Record<string, unknown> = {}) => ({
    spaceId,
    role: { permissions, isActive: true },
    space: { organizationId: 'org', isActive: true, enabledModules: null, ...space },
  });

  it('a workspace runs the CRM by its own modules, else the organization\'s', () => {
    const r = crmReachOfRow(row({
      spaceAssignments: [
        assigned('inherits', { crmViewAll: true }),
        assigned('own-on', { crmViewAll: true }, { enabledModules: ['crm'] }),
        assigned('own-off', { crmViewAll: true }, { enabledModules: ['tasks'] }),
      ],
    }));
    expect(Object.keys(r.spaces).sort()).toEqual(['inherits', 'own-on']);
  });

  it('an archived workspace, another organization\'s, or an inactive role grants nothing', () => {
    const r = crmReachOfRow(row({
      spaceAssignments: [
        assigned('archived', { crmViewAll: true }, { isActive: false }),
        assigned('foreign', { crmViewAll: true }, { organizationId: 'other' }),
        { spaceId: 'off', role: { permissions: { crmViewAll: true }, isActive: false }, space: { organizationId: 'org', isActive: true, enabledModules: null } },
      ],
    }));
    expect(r.spaces).toEqual({});
  });

  it('an inactive org role grants nothing (it used to be read by hand and honoured)', () => {
    const r = crmReachOfRow(row({ memberRole: { permissions: { crmViewAll: true }, isActive: false } }));
    expect(r.org.canAccess).toBe(false);
  });

  it('no row, no CRM', () => {
    expect(crmCapsAnywhere(crmReachOfRow(null)).canAccess).toBe(false);
  });
});
