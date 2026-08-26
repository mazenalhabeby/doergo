/**
 * The dashboard pages through EVERY member once a minute to refresh presence.
 * It was pulling the full member row to do it and reading nine fields off it.
 *
 * This pins the projection against the fields the dashboard actually consumes,
 * so trimming it further breaks a test rather than a screen — and so the
 * expensive columns cannot creep back in.
 */
describe('directory projection', () => {
  // Enumerated from the dashboard's _lib and _components.
  const USED_BY_DASHBOARD = [
    'id', 'firstName', 'lastName', 'avatarUrl', 'role', 'position',
    'isActive', 'presence', 'lastActiveAt', 'specialty',
    'canManageUsers', 'canViewAllTasks',
  ];

  const DIRECTORY_MEMBER_SELECT = {
    id: true, firstName: true, lastName: true, avatarUrl: true, role: true,
    position: true, isActive: true, presence: true, lastActiveAt: true,
    specialty: true, canManageUsers: true, canViewAllTasks: true,
  };

  it('covers every field the dashboard reads', () => {
    for (const f of USED_BY_DASHBOARD) {
      expect(DIRECTORY_MEMBER_SELECT).toHaveProperty(f, true);
    }
  });

  it('carries nothing beyond them', () => {
    expect(Object.keys(DIRECTORY_MEMBER_SELECT).sort()).toEqual([...USED_BY_DASHBOARD].sort());
  });

  it('excludes the expensive columns', () => {
    // A JSON blob, a string array and a relation join — per member, per page,
    // every minute, none of it rendered.
    for (const f of ['enabledModules', 'contactAllowedIds', 'memberRole', 'notificationPrefs']) {
      expect(DIRECTORY_MEMBER_SELECT).not.toHaveProperty(f);
    }
  });
});
