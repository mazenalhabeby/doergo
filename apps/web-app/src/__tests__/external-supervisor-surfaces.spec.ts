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

/* The bar reads the route table now; these ask the table about this role. */
import { ROUTE_RULES, navModelFor, type AccessUser } from '@/lib/route-access';
const supervisor = {
  user: {
    role: 'EMPLOYEE',
    isExternal: true,
    spaceModules: ['crm', 'assets', 'b2c_portal'],
    access: {
      org: {},
      perSpace: { s1: { canApproveOvertime: true, canReconcileAttendance: true, canViewAllTasks: true, canViewSpaceAttendance: true } },
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
    expect(ROUTE_RULES['/attendance'].need).toEqual(['any:canViewSpaceAttendance']);
    expect(navModelFor(supervisor).time).toContain('/attendance');
  });
});

describe('what an external member may never reach', () => {
  it('keeps org property out of their navigation', () => {
    // Their clients, equipment and portals belong to the organization. Assets
    // asked canViewAllTasks — a permission this role legitimately holds.
    for (const route of ['/clients', '/assets', '/portals']) expect(ROUTE_RULES[route].denyExternal).toBe(true);
    expect(navModelFor(supervisor)).toMatchObject({ clients: false, assets: false, portals: false });
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
