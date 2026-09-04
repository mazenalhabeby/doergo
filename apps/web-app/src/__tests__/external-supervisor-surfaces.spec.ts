import fs from 'fs';
import path from 'path';
import { BUILTIN_ROLES, EXTERNAL_DEFAULT_ROLE_SLUG } from '@hbcfield/shared/client';

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
 *     while the endpoint accepts canReconcileAttendance).
 */
const navbar = fs.readFileSync(
  path.join(process.cwd(), 'src/components/top-navbar.tsx'),
  'utf8',
);
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('the External Supervisor role', () => {
  const role = BUILTIN_ROLES.find((r) => r.slug === EXTERNAL_DEFAULT_ROLE_SLUG)!;

  it('grants exactly the four permissions the surfaces below are audited against', () => {
    const granted = Object.entries(role.permissions)
      .filter(([, v]) => v === true)
      .map(([k]) => k)
      .sort();
    expect(granted).toEqual(
      ['canApproveOvertime', 'canReconcileAttendance', 'canViewAllTasks', 'canViewSpaceAttendance'].sort(),
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
    expect(navbar).toContain("const showOvertime = hasPermission('canApproveOvertime')");
    expect(navbar).not.toMatch(/\{showAttendance && \(\s*<DropdownMenuItem[^]{0,200}\/overtime/);
  });

  it('opens the menu for somebody whose only grant is overtime', () => {
    // Otherwise the link exists and nothing renders it: their own approvals
    // queue is reachable only by typing the URL.
    expect(navbar).toContain('showSchedule || showAttendance || showOvertime');
  });

  it('the page refuses without it, space-aware', () => {
    const page = read('src/app/(dashboard)/overtime/page.tsx');
    expect(page).toContain('hasPermission("canApproveOvertime")');
    // hasPermission, not a flat column: the endpoints accept a space grant.
    expect(page).not.toContain('user?.canApproveOvertime === true');
  });
});

describe('canReconcileAttendance', () => {
  it('offers out-of-ring approval to whoever holds it, not only to admins', () => {
    // PATCH /attendance/excursions/:id/{approve,reject} are both
    // @RequirePermissionInSpace('canReconcileAttendance'). Gating the panel on
    // isAdmin left the grant unreachable.
    const tab = read('src/app/(dashboard)/attendance/_components/tracking-tab.tsx');
    expect(tab).toContain('<OutOfRingPanel canApprove={canReconcile} />');
    expect(tab).not.toContain('<OutOfRingPanel canApprove={isAdmin} />');
  });
});

describe('canViewSpaceAttendance', () => {
  it('gates the attendance surfaces space-aware, never on a flat column', () => {
    const page = read('src/app/(dashboard)/attendance/page.tsx');
    expect(page).toContain("hasPermission('canViewSpaceAttendance')");
    expect(page).not.toContain('user.canViewSpaceAttendance === true');
    expect(navbar).toContain("hasPermission('canViewSpaceAttendance')");
  });
});

describe('what an external member may never reach', () => {
  it('keeps org property out of their navigation', () => {
    // Their clients, equipment and portals belong to the organization. Assets
    // asked canViewAllTasks — a permission this role legitimately holds.
    expect(navbar).toContain('const isExternalMember = user.isExternal === true');
    for (const surface of ['showCrm', 'showAssets', 'showPortals']) {
      expect(navbar).toMatch(new RegExp(`const ${surface} = !isExternalMember &&`));
    }
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
