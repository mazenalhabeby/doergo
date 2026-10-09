import { DENY_EXTERNAL_KEY } from '../decorators/deny-external.decorator';
import { SpaceUnitsController, UnitDetailController } from '../../modules/portal/space-units.controller';
import { BillingController } from '../../modules/billing/billing.controller';

/**
 * Surfaces that are the organization's own business, closed to external
 * members whatever permission they hold (@DenyExternal):
 *   - portal units: the resident's name and contact phone. Neither External
 *     Supervisor nor External Observer is granted anything about residents.
 *   - the itemised bill: what the organization pays.
 */
describe('closed to external members', () => {
  const denied = (target: object) => Reflect.getMetadata(DENY_EXTERNAL_KEY, target) === true;

  it('both unit controllers (list, detail, activities)', () => {
    expect(denied(SpaceUnitsController)).toBe(true);
    expect(denied(UnitDetailController)).toBe(true);
  });

  it('GET /billing/bill', () => {
    expect(denied(BillingController.prototype.getBill)).toBe(true);
  });
});
