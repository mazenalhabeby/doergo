import { EXTERNAL_ALLOWED_PERMISSIONS } from '@hbcfield/shared';
import { allRoutes, externalPassesDecorators } from './external-reach.list';
import { EXTERNAL_OPEN_ROUTES, EXTERNAL_OPEN_REASONS } from './external-open-routes';

/**
 * THE SWEEP: what a signed-in external member can reach, across every gateway
 * route Nest registers (docs/plans/external-role-builder.md).
 *
 * Three ways a route admits an external member:
 *   1. it names a permission IN A SPACE — then only a key the member may hold
 *      opens it, and the service narrows to the workspaces granting that key
 *      (per-area specs pin the narrowing: attendance-decision-keys,
 *      crm-workspace-reach, asset-route-gates, portal-workspace-keys);
 *   2. it names no permission and is on the reviewed list, with its reason;
 *   3. nothing else. An org-wide permission never admits them (they hold no
 *      org role), @DenyExternal and @Public are excluded.
 */
describe('what an external member can reach', () => {
  const routes = allRoutes();
  const reachable = routes.filter(externalPassesDecorators);

  it('walks the whole API (an empty sweep would pass anything)', () => {
    expect(routes.length).toBeGreaterThan(500);
  });

  it('every route open WITHOUT a permission is on the reviewed list — and the list has no stale entries', () => {
    const open = reachable.filter((r) => !r.inSpace?.length).map((r) => r.id).sort();
    expect(open).toEqual(Object.keys(EXTERNAL_OPEN_ROUTES).sort());
  });

  it('every reviewed controller carries its reason', () => {
    for (const controller of new Set(Object.values(EXTERNAL_OPEN_ROUTES))) {
      expect(EXTERNAL_OPEN_REASONS[controller]?.length ?? 0).toBeGreaterThan(20);
    }
  });

  it('a space-gated route an external member can pass names at least one key they may hold — or they never pass it', () => {
    // Informational: a route whose keys are all org-only is simply closed to them.
    const allowed = new Set<string>(EXTERNAL_ALLOWED_PERMISSIONS);
    const openToThem = reachable.filter((r) => r.inSpace?.length && r.inSpace.every((k) => allowed.has(k)));
    expect(openToThem.length).toBeGreaterThan(0);
  });

  it('the organization’s own surfaces stay closed', () => {
    const closed = (prefix: string) => routes.filter((r) => r.path.startsWith(prefix)).every((r) => !externalPassesDecorators(r) || r.isPublic);
    for (const prefix of ['/calendar', '/analytics', '/legal-entities', '/invoices', '/billing/bill', '/invitations', '/organizations/members']) {
      expect([prefix, closed(prefix)]).toEqual([prefix, true]);
    }
  });
});
