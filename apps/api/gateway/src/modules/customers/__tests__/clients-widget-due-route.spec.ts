import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { CustomersController } from '../customers.controller';
import { ExternalMemberGuard } from '../../../common/guards/external-member.guard';

/*
  GET /customers/due — the Clients widget's one read, at the gateway edge.

  Two decisions live here and not in auth-service: an external member never
  reaches the organization's client book, and "is CRM running anywhere I work"
  is read off the session and forwarded as `crmOn`.
*/
describe('GET /customers/due — gateway', () => {
  const setup = (user: Record<string, unknown>) => {
    const authClient = { send: jest.fn(() => of({ data: { allowed: true } })) };
    const controller = new CustomersController(authClient as any, { send: jest.fn() } as any, {} as any, { customerChanged: jest.fn() } as any);
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

  it('an external member is refused (403) before anything is forwarded', () => {
    expect(guardFor({ id: 'x', isExternal: true })).toThrow(ForbiddenException);
    expect(guardFor({ id: 'm', isExternal: false })()).toBe(true);
  });

  it('forwards the caller from the TOKEN, never the query, and the member’s day as sent', async () => {
    const { controller, authClient, req } = setup({ spaceModules: ['crm'] });
    await controller.due(req, '2026-09-25T22:00:00.000Z', '2026-09-26T21:59:59.999Z', '3');
    expect(authClient.send).toHaveBeenCalledWith({ cmd: 'customers_due' }, {
      organizationId: 'org-1', caller: { userId: 'u1', role: 'EMPLOYEE' }, crmOn: true,
      dayStart: '2026-09-25T22:00:00.000Z', dayEnd: '2026-09-26T21:59:59.999Z', limit: 3,
    });
  });

  it('CRM switched off in every workspace the member works in → crmOn:false', async () => {
    const { controller, authClient, req } = setup({ spaceModules: ['tracking', 'time_tracking'] });
    await controller.due(req);
    expect((authClient.send.mock.calls[0] as any[])[1].crmOn).toBe(false);
  });

  it('no limit → none forwarded (the service defaults it)', async () => {
    const { controller, authClient, req } = setup({ spaceModules: ['crm'] });
    await controller.due(req);
    expect((authClient.send.mock.calls[0] as any[])[1].limit).toBeUndefined();
  });
});
