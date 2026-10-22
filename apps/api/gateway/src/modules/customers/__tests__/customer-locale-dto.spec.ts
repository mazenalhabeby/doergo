import { fakeServiceCalls } from '../../../common/testing/service-calls';
import { BadRequestException } from '@nestjs/common';
import { of } from 'rxjs';
import { CustomersController } from '../customers.controller';

import { fakeReq } from '../../../common/testing/fake-request';
/*
  POST / PATCH /customers — "Language for emails".

  A value off the supported list is refused at the edge, before anything is
  forwarded: no round trip to auth-service, no module check on the way.
  auth-service refuses it too, because the phone's offline sync reaches it by
  another route.
*/
describe('customer body — locale', () => {
  function setup() {
    const authClient = { send: jest.fn(() => of({ data: { id: 'c1' } })) };
    const spaceModules = { assertEnabled: jest.fn(async () => undefined) };
    const orgEvents = { customerChanged: jest.fn() };
    const controller = new CustomersController(
      fakeServiceCalls({ auth: authClient }),
      spaceModules as any,
      {} as any,
      orgEvents as any,
    );
    const req = { user: { id: 'u1', role: 'ADMIN', organizationId: 'org-1' } };
    return { controller, authClient, spaceModules, req };
  }

  it.each(['pt', 'de-AT', 'German', 7])('refuses %p on create and on update, forwarding nothing', async (locale) => {
    const { controller, authClient, spaceModules, req } = setup();
    await expect(controller.create({ name: 'BILLA AG', locale: locale as any }, fakeReq(req))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.update('c1', { locale: locale as any }, fakeReq(req))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(authClient.send).not.toHaveBeenCalled();
    expect(spaceModules.assertEnabled).not.toHaveBeenCalled();
  });

  it('forwards a supported language, a cleared one, and a body without one', async () => {
    const { controller, authClient, req } = setup();
    await controller.create({ name: 'BILLA AG', locale: 'de' }, fakeReq(req));
    await controller.update('c1', { locale: '' }, fakeReq(req));
    await controller.update('c1', { locale: null }, fakeReq(req));
    await controller.update('c1', { phone: '+43 1' }, fakeReq(req));

    const dtos = (authClient.send.mock.calls as unknown as Array<[unknown, { dto: Record<string, unknown> }]>).map(
      ([, payload]) => payload.dto,
    );
    expect(dtos.map((d) => d.locale)).toEqual(['de', '', null, undefined]);
  });
});
