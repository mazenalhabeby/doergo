import fs from 'fs';
import path from 'path';
import { BUILTIN_ROLES, EXTERNAL_ALLOWED_PERMISSIONS, type PermissionSet } from '@hbcfield/shared';

/**
 * The External Observer reads, and raises a job. That is the whole role.
 *
 * "Read-only" is easy to claim and hard to keep: it survives only while every
 * write is gated on a PERMISSION. The day somebody adds a mutation gated on
 * "is a member of the org" — which reads as safe, and is how the work-log and
 * shift-issue leaks both happened — an outsider silently gains a write.
 *
 * So this walks the gateway's own controllers rather than trusting a list.
 *
 * One deliberate exception: SIGNING. A signature is authorised by being NAMED
 * on the document, through the signer chain, never by a permission. A document
 * routed to the client's representative must reach them whichever external role
 * they hold, so signing sits outside this check by design — gating it on a
 * permission would break the chain.
 */
const ROOT = path.join(__dirname, '../../modules');

function controllerFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...controllerFiles(full));
    else if (entry.name.endsWith('.controller.ts')) out.push(full);
  }
  return out;
}

describe('the External Observer role', () => {
  const observer = BUILTIN_ROLES.find((r) => r.slug === 'external-observer');

  it('exists, is space-scoped, and grants exactly two permissions', () => {
    expect(observer).toBeDefined();
    // An ORG-scoped role would reach every space — the one thing an outsider
    // must never have.
    expect(observer!.scope).toBe('SPACE');
    const granted = Object.entries(observer!.permissions as PermissionSet)
      .filter(([, v]) => v === true)
      .map(([k]) => k)
      .sort();
    expect(granted).toEqual(['canCreateTasks', 'canViewAllTasks']);
  });

  it('holds nothing outside what an external member may hold at all', () => {
    for (const key of Object.keys(observer!.permissions as PermissionSet)) {
      if ((observer!.permissions as Record<string, unknown>)[key] !== true) continue;
      expect(EXTERNAL_ALLOWED_PERMISSIONS).toContain(key as never);
    }
  });

  it('holds no hours: no attendance, no rota, no overtime', () => {
    const p = observer!.permissions as Record<string, unknown>;
    // Not merely absent from the UI — never granted, so the Time & Attendance
    // menu cannot appear and every one of its endpoints refuses.
    for (const key of [
      'canViewSpaceAttendance',
      'canReconcileAttendance',
      'canApproveOvertime',
      'canManageRota',
    ]) {
      expect(p[key]).not.toBe(true);
    }
  });

  it('cannot assign the work it raises', () => {
    // Creating is not assigning. The create route strips an assignee from
    // anyone without canAssignTasks, so this is the pair that must stay split.
    const p = observer!.permissions as Record<string, unknown>;
    expect(p.canCreateTasks).toBe(true);
    expect(p.canAssignTasks).not.toBe(true);
  });
});


/*
 * Mutations that today authorise on `canViewAllTasks`, with the reason each is
 * not reachable by an External Observer — and why each is still debt.
 *
 * Written out rather than tolerated silently: a NEW controller doing this
 * fails, and these three stay visible until they are given the right
 * permission. None is a fix that belongs in the same change as introducing a
 * role, because each moves who may act for EXISTING customers.
 */
const KNOWN: Record<string, string> = {
  // Closed to every external member by @DenyExternal, so an Observer cannot
  // reach them at all. The remaining exposure is internal: a view-only member
  // can create and edit the organization's equipment. `canManageAssets` exists
  // and is the right gate; switching would change who may add an asset today.
  'assets/assets.controller.ts': 'DenyExternal + should be canManageAssets',
  'assets/asset-categories.controller.ts': 'DenyExternal + should be canManageAssets',
  // Org-wide @RequirePermission, and an Observer holds canViewAllTasks only in
  // a space — so the guard refuses them. Safe by accident of the gate rather
  // than by intent, which is exactly why it is written down.
  'epics/epics.controller.ts': 'org-wide gate; an agile manage permission is the right one',
  // Cross-org, org-wide, and a REQUEST rather than a change: a guest who can
  // see a shared space asking its host for more work. Defensible at view level.
  'space-sharing/space-sharing.controller.ts': 'asks the host for more work; changes nothing',
};

describe('a READ permission never authorises a write', () => {
  const files = controllerFiles(ROOT);

  it('finds the controllers to check', () => {
    // Guards the guard: a broken path would make this suite vacuously pass.
    expect(files.length).toBeGreaterThan(20);
  });

  /*
    The precise risk this role creates.

    An External Observer holds `canViewAllTasks` — a READ permission, and the
    broadest one they have. If any mutation is ever gated on it, an outsider who
    was given sight of a site silently gains the ability to change it.

    This is not hypothetical: `canViewAllTasks` is already used as a proxy for
    "is a manager" in several places, and the assets nav did exactly that. The
    day somebody writes `@RequirePermissionInSpace('canViewAllTasks')` above a
    @Post, this fails.

    Deliberately narrow. It does not try to prove "no unguarded writes exist" —
    plenty of mutations legitimately act on the caller's OWN record (clock-in,
    change-password, your own work-log) and are decided in the service from the
    caller's id, which no static check can read. It proves the one thing that
    is both decidable and dangerous.
  */
  it.each(files.map((f) => [path.relative(ROOT, f), f]))(
    '%s',
    (_name, file) => {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      const offenders: string[] = [];

      lines.forEach((line, i) => {
        if (!/^\s*@(Post|Patch|Put|Delete)\(/.test(line)) return;
        // Decorators sit between the route and its handler.
        const block = lines.slice(i, i + 8).join('\n');
        if (/@RequirePermission(InSpace)?\(\s*'canViewAllTasks'\s*\)/.test(block)) {
          offenders.push(`${i + 1}: ${line.trim()}`);
        }
      });

      const rel = path.relative(ROOT, file);
      expect(offenders.length === 0 || rel in KNOWN).toBe(true);
    },
  );
});

describe('what the Observer may write', () => {
  it('is task creation, and nothing else it holds can authorise a write', () => {
    /*
      `canCreateTasks` is a write permission and they have it — that is the
      point of the role: raise a job. It reaches task create, subtask create and
      task dependencies, all of which are "describing the work" rather than
      directing it, and all of which are space-scoped.

      Everything else they hold is `canViewAllTasks`, covered above.
    */
    const observer = BUILTIN_ROLES.find((r) => r.slug === 'external-observer')!;
    const writeCapable = Object.entries(observer.permissions as Record<string, unknown>)
      .filter(([, v]) => v === true)
      .map(([k]) => k)
      .filter((k) => k !== 'canViewAllTasks');
    expect(writeCapable).toEqual(['canCreateTasks']);
  });
});
