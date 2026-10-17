import { Reflector } from '@nestjs/core';
import { CustomersController } from '../customers.controller';
import { CustomerContactsController } from '../customer-contacts.controller';
import { CustomerAddressesController } from '../customer-addresses.controller';
import { CustomerInviteController } from '../customer-invite.controller';

/** Every /customers controller — one class until 2026-10-17. */
const CONTROLLERS = [CustomersController, CustomerContactsController, CustomerAddressesController, CustomerInviteController];
const owner = (method: string) => CONTROLLERS.find((C) => Object.prototype.hasOwnProperty.call(C.prototype, method))!;
import { DENY_EXTERNAL_KEY } from '../../../common/decorators/deny-external.decorator';

/*
  The customers surface is open to external members by their CRM grant in a
  workspace (decided in customers.service), EXCEPT what belongs to the
  organization rather than a workspace: the phone's address book and bringing
  a client into the app. Pinned per route, so a class-level decorator coming
  back — or a route losing its own — fails here.
*/
describe('customers controller — who external members may reach', () => {
  const reflector = new Reflector();
  const denied = (method: string) =>
    !!reflector.getAllAndOverride<boolean>(DENY_EXTERNAL_KEY, [(owner(method).prototype as any)[method], owner(method)]);

  it('no class itself is closed to them', () => {
    for (const C of CONTROLLERS) expect(reflector.get(DENY_EXTERNAL_KEY, C)).toBeFalsy();
  });

  it.each(['matchKeys', 'importContacts', 'invite', 'resendInvite'] as const)('%s stays closed to external members', (m) => {
    expect(denied(m)).toBe(true);
  });

  it.each(['list', 'get', 'create', 'update', 'due', 'listActivities', 'addActivity', 'listContacts', 'addAddress'] as const)(
    '%s is decided by the CRM reach, not by the relationship',
    (m) => {
      expect(denied(m)).toBe(false);
    },
  );
});
