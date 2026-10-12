/**
 * Signing off, correcting and erasing somebody's shift are three permissions.
 *
 *   canApproveAttendance   approve / reject an entry, bulk approve,
 *                          approve / reject time away from the site
 *   canReconcileAttendance correct: edit times, add a manual entry, add / end /
 *                          delete a break, excuse or reopen a no-show
 *   canDeleteAttendance    delete a time entry
 *
 * All of them used to ride on canReconcileAttendance, so a client's supervisor
 * who should only put their name to the hours could also rewrite and erase them.
 *
 * Two things must hold for every route, and both are invisible in review:
 *
 *   1. the decorator names the right key;
 *   2. the SAME key narrows what the service may touch. The guard only widens
 *      (a grant in any workspace passes it); `this.scope(req, key)` is what keeps
 *      the service inside the workspaces granting that key. Gated on one key and
 *      narrowed by another, a grant in workspace A acts on workspace B.
 */
import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PERMISSIONS_IN_SPACE_KEY } from '@hbcfield/shared';
import { AttendanceController } from '../attendance.controller';

type Key = 'canApproveAttendance' | 'canReconcileAttendance' | 'canDeleteAttendance';

/** route method → [the key it needs, how to call it, the service method it forwards to] */
const ROUTES: Record<string, [Key, (c: any, req: any) => Promise<unknown>, string]> = {
  approveEntry: ['canApproveAttendance', (c, req) => c.approveEntry('e1', {}, req), 'approveEntry'],
  rejectEntry: ['canApproveAttendance', (c, req) => c.rejectEntry('e1', { reason: 'no' }, req), 'rejectEntry'],
  bulkApprove: ['canApproveAttendance', (c, req) => c.bulkApprove({ entryIds: ['e1'] }, req), 'bulkApprove'],
  approveExcursion: ['canApproveAttendance', (c, req) => c.approveExcursion('x1', {}, req), 'approveExcursion'],
  rejectExcursion: ['canApproveAttendance', (c, req) => c.rejectExcursion('x1', req), 'rejectExcursion'],
  deleteEntry: ['canDeleteAttendance', (c, req) => c.deleteEntry('e1', req), 'deleteEntry'],
  editEntry: ['canReconcileAttendance', (c, req) => c.editEntry('e1', { reason: 'fix' }, req), 'editEntry'],
  addManualEntries: [
    'canReconcileAttendance',
    (c, req) => c.addManualEntries({ userId: 'u', locationId: 'l', startDate: 'd', endDate: 'd', startTime: '08:00', endTime: '16:00' }, req),
    'addManualEntries',
  ],
  addBreakForMember: ['canReconcileAttendance', (c, req) => c.addBreakForMember('e1', { type: 'SHORT' }, req), 'addBreakForMember'],
  deleteBreak: ['canReconcileAttendance', (c, req) => c.deleteBreak('b1', req), 'deleteBreak'],
  endBreakManually: ['canReconcileAttendance', (c, req) => c.endBreakManually('b1', {}, req), 'endBreakManually'],
  resolveNoShow: ['canReconcileAttendance', (c, req) => c.resolveNoShow('n1', { action: 'excuse' }, req), 'resolveNoShow'],
};

const SPACE_OF: Record<Key, string> = {
  canApproveAttendance: 'space-approve',
  canReconcileAttendance: 'space-fix',
  canDeleteAttendance: 'space-delete',
};

/** Holds each key in exactly one workspace, so a narrowing by the wrong key shows. */
const splitHolder = {
  id: 'lead', role: 'EMPLOYEE', organizationId: 'org-1',
  access: {
    org: {},
    perSpace: {
      'space-approve': { canApproveAttendance: true },
      'space-fix': { canReconcileAttendance: true },
      'space-delete': { canDeleteAttendance: true },
    },
  },
};
const admin = { id: 'admin', role: 'ADMIN', organizationId: 'org-1', access: { org: {}, perSpace: {} } };

function controller() {
  const service = new Proxy({} as Record<string, jest.Mock>, {
    get: (target, prop: string) => (target[prop] ??= jest.fn().mockResolvedValue({ success: true })),
  });
  return { ctrl: new AttendanceController(service as any, {} as any) as any, service };
}

describe('attendance decisions — the gate', () => {
  it.each(Object.entries(ROUTES))('%s requires %s, and only that', (route, [key]) => {
    const perms = Reflect.getMetadata(PERMISSIONS_IN_SPACE_KEY, (AttendanceController.prototype as any)[route]);
    expect(perms).toEqual([key]);
  });
});

describe('attendance decisions — the scope handed to the service', () => {
  it.each(Object.entries(ROUTES))('%s narrows to the workspaces granting its own key', async (_route, [key, call, method]) => {
    const { ctrl, service } = controller();
    await call(ctrl, { user: splitHolder });
    expect(service[method]!.mock.calls[0][0].scopeSpaceIds).toEqual([SPACE_OF[key]]);
  });

  it.each(Object.entries(ROUTES))('%s: an admin is never narrowed', async (_route, [, call, method]) => {
    const { ctrl, service } = controller();
    await call(ctrl, { user: admin });
    expect(service[method]!.mock.calls[0][0].scopeSpaceIds).toBeNull();
  });

  it('correcting does not reach a sign-off or a delete', async () => {
    // Somebody who may only correct: an approve or a delete narrows to NOTHING.
    const fixer = { ...splitHolder, access: { org: {}, perSpace: { 'space-fix': { canReconcileAttendance: true } } } };
    const { ctrl, service } = controller();
    await ROUTES.approveEntry![1](ctrl, { user: fixer });
    await ROUTES.deleteEntry![1](ctrl, { user: fixer });
    expect(service.approveEntry!.mock.calls[0][0].scopeSpaceIds).toEqual([]);
    expect(service.deleteEntry!.mock.calls[0][0].scopeSpaceIds).toEqual([]);
  });
});

/*
  The same rule for EVERY route in the controller, read from the source: a route
  that names a space-aware permission and narrows with `this.scope(req, …)` must
  narrow by the key it is gated on. Catches the next route, not just these.
*/
describe('attendance controller — decorator key = narrowing key', () => {
  const src = readFileSync(join(__dirname, '..', 'attendance.controller.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const blocks = src.split(/\n\s*@(?:Get|Post|Patch|Put|Delete)\(/).slice(1);

  it('reads real routes', () => {
    expect(blocks.length).toBeGreaterThan(40);
  });

  it('every gated route narrows by its own key', () => {
    const mismatched: string[] = [];
    for (const block of blocks) {
      const gate = block.match(/@RequirePermissionInSpace\('([^']+)'\)/)?.[1];
      if (!gate) continue;
      const scopes = [...block.matchAll(/this\.scope\(req,\s*'([^']+)'\)/g)].map((m) => m[1]);
      for (const s of scopes) if (s !== gate) mismatched.push(`${block.split('\n')[0]} gated ${gate}, narrowed ${s}`);
    }
    expect(mismatched).toEqual([]);
  });
});
