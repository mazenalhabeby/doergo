import { DENY_EXTERNAL_KEY } from '../decorators/deny-external.decorator';
import { SpaceUnitsController, UnitDetailController } from '../../modules/portal/space-units.controller';
import { PortalAdminController } from '../../modules/portal/portal-admin.controller';
import { PortalResidentsController } from '../../modules/portal/portal-residents.controller';
import { SpacePortalController } from '../../modules/portal/space-portal.controller';
import { BillingController } from '../../modules/billing/billing.controller';

/**
 * Surfaces that are the organization's own business, closed to external
 * members whatever permission they hold (@DenyExternal):
 *   - the itemised bill: what the organization pays.
 *   - in the customer portal, only what is the ORGANIZATION's decision rather
 *     than the running of a workspace's portal: creating or deleting a portal
 *     (a billed line), and customer ACCOUNTS — inviting, re-inviting, removing
 *     a resident. Reading, answering and configuring a workspace's portal is
 *     open to an external member who was given the portal keys for it
 *     (portal-workspace-keys.spec.ts covers how those are narrowed).
 */
describe('closed to external members', () => {
  const denied = (target: object) => Reflect.getMetadata(DENY_EXTERNAL_KEY, target) === true;

  it('GET /billing/bill', () => {
    expect(denied(BillingController.prototype.getBill)).toBe(true);
  });

  it.each([
    ['portal/admin POST portals', PortalAdminController.prototype.createPortal],
    ['portal/admin DELETE portals/:id', PortalAdminController.prototype.deletePortal],
    ['portal/admin POST residents', PortalResidentsController.prototype.inviteResident],
    ['portal/admin POST residents/:id/resend-invite', PortalResidentsController.prototype.resendResidentInvite],
    ['portal/admin DELETE residents/:id', PortalResidentsController.prototype.removeResident],
    ['spaces/:spaceId/portal POST portals', SpacePortalController.prototype.createPortal],
  ])('%s', (_name, handler) => {
    expect(denied(handler)).toBe(true);
  });

  it('the portal controllers are NOT closed as a whole any more', () => {
    for (const c of [PortalAdminController, SpacePortalController, SpaceUnitsController, UnitDetailController]) {
      expect(denied(c)).toBe(false);
    }
  });
});
