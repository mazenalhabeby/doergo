import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { CustomersController } from '../customers.controller';
import { ExternalMemberGuard } from '../../../common/guards/external-member.guard';

import { fakeReq } from '../../../common/testing/fake-request';
/*
  GET /customers/due — the Clients widget's one read, at the gateway edge.

  One decision lives here and not in auth-service: "is CRM running anywhere I
  work" is read off the session and forwarded as `crmOn`. Whose clients — an
  external member's included — is the service's (crm/crm-reach.ts).
*/
describe('GET /customers/due — gateway', () => {
  const setup = (user: Record<string, unknown>) => {
    const authClient = { send: jest.fn(() => of({ data: { allowed: true } })) };
    const controller = new CustomersController(
      authClient as any,
      { send: jest.fn() } as any,
      {} as any,
      { customerChanged: jest.fn() } as any,
    );
    return { controller, authClient, req: { user: { id: 'u1', role: 'EMPLOYEE', organizationId: 'org-1', ...user } } };
  };
  const guardFor = (user: Record<string, unknown>) => {
    const guard = new ExternalMemberGuard(new Reflector());
    const ctx = {
      getHandler: () => CustomersController.prototype.due,
      getClass: () => CustomersController,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as any;
    return () => guard.canActivate(ctx);
  };

  // An external member's reach is their workspace's CRM grant, resolved in
  // customers.service (no org-wide caps) — the relationship no longer closes the door.
  it('an external member passes the edge; the service narrows them to their workspace', () => {
    expect(guardFor({ id: 'x', isExternal: true })()).toBe(true);
    expect(guardFor({ id: 'm', isExternal: false })()).toBe(true);
  });

  it('forwards the caller from the TOKEN, never the query, and the member’s day as sent', async () => {
    const { controller, authClient, req } = setup({ spaceModules: ['crm'] });
    await controller.due(fakeReq(req), '2026-09-25T22:00:00.000Z', '2026-09-26T21:59:59.999Z', '3');
    expect(authClient.send).toHaveBeenCalledWith(
      { cmd: 'customers_due' },
      {
        organizationId: 'org-1',
        caller: { userId: 'u1', role: 'EMPLOYEE' },
        crmOn: true,
        dayStart: '2026-09-25T22:00:00.000Z',
        dayEnd: '2026-09-26T21:59:59.999Z',
        limit: 3,
      },
    );
  });

  it('CRM switched off in every workspace the member works in → crmOn:false', async () => {
    const { controller, authClient, req } = setup({ spaceModules: ['tracking', 'time_tracking'] });
    await controller.due(fakeReq(req));
    expect((authClient.send.mock.calls[0] as any[])[1].crmOn).toBe(false);
  });

  it('no limit → none forwarded (the service defaults it)', async () => {
    const { controller, authClient, req } = setup({ spaceModules: ['crm'] });
    await controller.due(fakeReq(req));
    expect((authClient.send.mock.calls[0] as any[])[1].limit).toBeUndefined();
  });
});
