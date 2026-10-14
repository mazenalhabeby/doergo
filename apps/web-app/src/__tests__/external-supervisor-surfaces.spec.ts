import fs from 'fs';
import path from 'path';
import { BUILTIN_ROLES, EXTERNAL_DEFAULT_ROLE_SLUG } from '@hbcfield/shared/client';
import { readNavbar } from './_navbar-screen';

/**
 * The External Supervisor's four permissions, audited one by one.
 *
 * The rule this suite exists to hold: for each permission, the SURFACE and the
 * ENDPOINT behind it must ask the same question. Two ways to get that wrong,
 * and this role has hit both:
 *
 *   • the surface asks LESS — a control is offered and the server refuses it,
 *     which reads as a broken app rather than a permission (Overtime rendered
 *     478 lines of approve/reject with no check of any kind);
 *   • the surface asks MORE — a granted permission can never be used, which
 *     makes it decorative (out-of-ring approval was offered to admins only,
 *     while the endpoint accepted the attendance grant).
 */
const navbar = readNavbar();
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

/* The bar reads the route table now; these ask the table about this role. */
import { ROUTE_RULES, navModelFor, type AccessUser } from '@/lib/route-access';
const supervisor = {
  user: {
    role: 'EMPLOYEE',
    isExternal: true,
    spaceModules: ['crm', 'assets', 'b2c_portal'],
    access: {
      org: {},
      perSpace: { s1: { canApproveOvertime: true, canApproveAttendance: true, canViewAllTasks: true, canViewSpaceAttendance: true } },
    },
  } as AccessUser,
  hasOption: () => true,
};

describe('the External Supervisor role', () => {
  const role = BUILTIN_ROLES.find((r) => r.slug === EXTERNAL_DEFAULT_ROLE_SLUG)!;

  it('grants exactly the four permissions the surfaces below are audited against', () => {
    const granted = Object.entries(role.permissions)
      .filter(([, v]) => v === true)
      .map(([k]) => k)
      .sort();
    expect(granted).toEqual(
      // Signs off our hours; correcting and deleting are switches an admin turns
      // on per person — never part of the built-in.
      ['canApproveAttendance', 'canApproveOvertime', 'canViewAllTasks', 'canViewSpaceAttendance'].sort(),
    );
  });

  it('is space-scoped — an org role would reach every space', () => {
    expect(role.scope).toBe('SPACE');
  });
});

describe('canApproveOvertime', () => {
  it('gates the Overtime link on the permission its routes actually ask', () => {
    // All four /overtime routes are @RequirePermissionInSpace('canApproveOvertime'),
    // the two READS included. The link used to follow showAttendance, which is a
    // different question and got both directions wrong.
    expect(ROUTE_RULES['/overtime'].need).toEqual(['any:canApproveOvertime']);
    expect(navbar).not.toMatch(/\{showAttendance && \(\s*<DropdownMenuItem[^]{0,200}\/overtime/);
  });

  it('opens the menu for somebody whose only grant is overtime', () => {
    // Otherwise the link exists and nothing renders it: their own approvals
    // queue is reachable only by typing the URL.
    expect(navbar).toContain('showSchedule || showAttendance || showOvertime');
    expect(navModelFor(supervisor).time).toContain('/overtime');
  });

  it('the page refuses without it, space-aware', () => {
    const page = read('src/app/(dashboard)/overtime/page.tsx');
    expect(page).toContain('hasPermission("canApproveOvertime")');
    // hasPermission, not a flat column: the endpoints accept a space grant.
    expect(page).not.toContain('user?.canApproveOvertime === true');
  });
});

describe('canApproveAttendance', () => {
  it('time away from the site is decided in Approvals — the panel only shows agreed time', () => {
    // PATCH /attendance/excursions/:id/{approve,reject} are asked from the inbox
    // (kind "away"), as the caller, with canApproveAttendance.
    const panel = read('src/app/(dashboard)/attendance/_components/out-of-ring-panel.tsx');
    expect(panel).not.toMatch(/approveExcursion|rejectExcursion/);
  });

  it('the page reads each of the three attendance decisions space-aware', () => {
    const page = read('src/app/(dashboard)/attendance/page.tsx');
    expect(page).toContain('hasPermission("canDeleteAttendance")');
    expect(page).toContain('hasPermission("canReconcileAttendance")');
  });

  it('hours are decided in Approvals, never on the attendance page', () => {
    const page = read('src/app/(dashboard)/attendance/page.tsx');
    expect(page).not.toMatch(/approveEntry|rejectEntry/);
  });
});

describe('canDeleteAttendance', () => {
  it('Remove follows its own permission, not the correction grant', () => {
    // DELETE /attendance/entries/:id asks canDeleteAttendance; the edit asks
    // canReconcileAttendance. Each half of the dialog asks its own.
    const dialog = read('src/app/(dashboard)/attendance/_components/edit-entry-dialog.tsx');
    expect(dialog).toContain('{canDelete && (');
    expect(dialog).toContain('{canEdit && (');
    const tab = read('src/app/(dashboard)/attendance/_components/tracking-tab.tsx');
    expect(tab).toContain('canEdit={canReconcile} canDelete={canDelete}');
  });
});

describe('canViewSpaceAttendance', () => {
  it('gates the attendance surfaces space-aware, never on a flat column', () => {
    const page = read('src/app/(dashboard)/attendance/page.tsx');
    expect(page).toContain("hasPermission('canViewSpaceAttendance')");
    expect(page).not.toContain('user.canViewSpaceAttendance === true');
    expect(ROUTE_RULES['/attendance'].need).toEqual(['any:canViewSpaceAttendance']);
    expect(navModelFor(supervisor).time).toContain('/attendance');
  });
});

describe('what an external member may never reach', () => {
  it('reaches clients, assets and portals only by a grant for them — never through canViewAllTasks', () => {
    // These are per-workspace now (the permission builder). What gates them is
    // the permission the route asks — canViewAssets, canViewPortal, the crm*
    // keys — never canViewAllTasks, which this role legitimately holds.
    expect(ROUTE_RULES['/assets'].need).toEqual(['any:canViewAssets']);
    expect(ROUTE_RULES['/portals'].need).toEqual(['any:canViewPortal']);
    expect(navModelFor(supervisor)).toMatchObject({ clients: false, assets: false, portals: false });
  });

  it('keeps what stays the organization\'s own closed to them, whatever they hold', () => {
    for (const route of ['/calendar', '/reports', '/settings/billing', '/employees/availability', '/employees/leave-opening']) {
      expect([route, ROUTE_RULES[route].denyExternal]).toEqual([route, true]);
    }
    expect(navModelFor(supervisor).calendar).toBe(false);
  });

  it('still reaches their own documents — they countersign', () => {
    // /my/documents is the signing surface: the reminder links there and the
    // nav item carries the count. Removing it would strand a supervisor whose
    // notification leads exactly there.
    const sections = read('src/hooks/use-my-sections.ts');
    expect(sections).toContain('/my/documents');
    expect(sections).not.toContain('isExternal');
  });
});
