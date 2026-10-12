import { Reflector } from '@nestjs/core';
import { CustomersController } from '../customers.controller';
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
  const denied = (method: keyof CustomersController) =>
    !!reflector.getAllAndOverride<boolean>(DENY_EXTERNAL_KEY, [
      (CustomersController.prototype as any)[method],
      CustomersController,
    ]);

  it('the class itself is not closed to them', () => {
    expect(reflector.get(DENY_EXTERNAL_KEY, CustomersController)).toBeFalsy();
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
