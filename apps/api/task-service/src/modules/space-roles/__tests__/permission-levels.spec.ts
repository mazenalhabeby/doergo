import {
  ACCESS_PERMISSION_SCHEMA,
  BUILTIN_ROLES,
  EXTERNAL_ALLOWED_PERMISSIONS,
  OBSERVER_SEAT_PERMISSIONS,
  PERMISSION_AREAS,
  PERMISSION_KEYS,
  PERMISSION_PRESETS,
  PERMISSION_SWITCHES,
  choiceFromPermissions,
  choiceOfPreset,
  externalForbiddenIn,
  isObserverSeat,
  keysOfLevel,
  permissionsFromChoice,
  presetOfPermissions,
  type PermissionSet,
} from '@hbcfield/shared';

/**
 * The builder's model (packages/shared/src/access/permission-levels.ts):
 * areas → levels → keys, switches, presets. A level is a VIEW over a
 * PermissionSet, so the one property that matters is that reading and
 * writing it never loses or invents a grant.
 */
describe('permission levels', () => {
  it('a level grants its own keys and every lower level’s', () => {
    expect(keysOfLevel('crm', 'edit').sort()).toEqual(['crmCreateClients', 'crmEditInfo', 'crmViewAll', 'crmWork'].sort());
    expect(keysOfLevel('crm', 'none')).toEqual([]);
    expect(keysOfLevel('crm', 'nonsense')).toEqual([]);
  });

  it('round-trips every preset exactly', () => {
    for (const id of Object.keys(PERMISSION_PRESETS) as (keyof typeof PERMISSION_PRESETS)[]) {
      const perms = permissionsFromChoice(choiceOfPreset(id));
      expect(choiceFromPermissions(perms)).toEqual(choiceOfPreset(id));
      expect(presetOfPermissions(perms)).toBe(id);
    }
  });

  it('keeps a grant no level explains instead of dropping it', () => {
    const odd: PermissionSet = { crmManageClients: true, canViewAllTasks: true, crmViewOwn: true };
    const choice = choiceFromPermissions(odd);
    expect(choice.levels.crm).toBe('none');
    expect(choice.extra).toEqual(expect.arrayContaining(['crmManageClients', 'crmViewOwn']));
    expect(permissionsFromChoice(choice)).toEqual(odd);
  });

  it('a switch whose area is too low grants nothing', () => {
    const perms = permissionsFromChoice({ levels: { attendance: 'none' } as never, switches: { deleteAttendance: true } as never });
    expect(perms.canDeleteAttendance).toBeUndefined();
    const ok = permissionsFromChoice({ levels: { attendance: 'view' } as never, switches: { deleteAttendance: true } as never });
    expect(ok.canDeleteAttendance).toBe(true);
  });

  it('only ever writes known keys', () => {
    const perms = permissionsFromChoice({ extra: ['canDropDatabase' as never, 'canViewAssets'] });
    expect(Object.keys(perms)).toEqual(['canViewAssets']);
  });

  it('every key a level or switch can grant is space-capable and allowed for an external member', () => {
    const used = new Set([...PERMISSION_AREAS.flatMap((a) => a.levels.flatMap((l) => l.adds)), ...PERMISSION_SWITCHES.map((s) => s.key)]);
    for (const key of used) {
      expect(ACCESS_PERMISSION_SCHEMA.find((p) => p.key === key)?.scopes).toContain('space');
      expect(EXTERNAL_ALLOWED_PERMISSIONS).toContain(key);
    }
  });

  it('the observer preset is exactly the €2 seat; every other preset is a full seat', () => {
    const observer = permissionsFromChoice(choiceOfPreset('observer'));
    expect(Object.keys(observer).sort()).toEqual([...OBSERVER_SEAT_PERMISSIONS].sort());
    const held = (p: PermissionSet) => PERMISSION_KEYS.filter((k) => p[k]);
    expect(isObserverSeat({ isExternal: true }, held(observer))).toBe(true);
    for (const id of ['supervisor', 'manager'] as const) {
      expect(isObserverSeat({ isExternal: true }, held(permissionsFromChoice(choiceOfPreset(id))))).toBe(false);
    }
  });
});

describe('what an external member may hold', () => {
  it('never the keys that reach past the workspace or set prices', () => {
    for (const key of ['canManageUsers', 'canViewReports', 'canManageInvoices', 'canViewLabourCost', 'canManageWorkspaces', 'canManageTaskTypes', 'canViewMemberDocuments', 'canOpenMemberDocuments', 'canDeleteDocuments'] as const) {
      expect(EXTERNAL_ALLOWED_PERMISSIONS).not.toContain(key);
    }
  });

  it('an org-only key is never allowed, even if somebody marks it external', () => {
    for (const p of ACCESS_PERMISSION_SCHEMA) {
      if (!p.scopes.includes('space')) expect(EXTERNAL_ALLOWED_PERMISSIONS).not.toContain(p.key);
    }
  });

  it('names the offending keys', () => {
    expect(externalForbiddenIn({ canViewAssets: true, canManageUsers: true, canManageInvoices: true })).toEqual(['canManageUsers', 'canManageInvoices']);
  });

  it('the built-in external roles hold only what an external member may', () => {
    for (const slug of ['external-observer', 'external-supervisor']) {
      const role = BUILTIN_ROLES.find((r) => r.slug === slug)!;
      expect(externalForbiddenIn(role.permissions)).toEqual([]);
    }
  });

  it('the external supervisor signs hours off without rewriting or deleting them', () => {
    const role = BUILTIN_ROLES.find((r) => r.slug === 'external-supervisor')!;
    expect(role.permissions.canApproveAttendance).toBe(true);
    expect(role.permissions.canReconcileAttendance).toBeUndefined();
    expect(role.permissions.canDeleteAttendance).toBeUndefined();
  });
});
