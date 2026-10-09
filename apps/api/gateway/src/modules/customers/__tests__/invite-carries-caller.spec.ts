import { of } from 'rxjs';
import { CustomersController } from '../customers.controller';

/*
  POST /customers/:id/invite read and rewrote the client record as nobody in
  particular, so customers.service could not apply the caller's CRM caps or
  their ownership of the record. Both calls carry the caller now.
*/
describe('POST /customers/:id/invite', () => {
  it('passes the caller to get_customer and update_customer', async () => {
    const replies: Record<string, unknown> = {
      get_customer: { data: { id: 'c1', spaceId: 's1', email: 'a@b.at', name: 'BILLA AG' } },
      portal_list_units: [{ id: 'unit-1', portalId: 'p1', isPrimary: true }],
      create_invitation: { data: { code: 'ABCDEFGHJK' } },
      update_customer: { success: true },
    };
    const authClient = { send: jest.fn(({ cmd }: { cmd: string }) => of(replies[cmd] ?? {})) };
    const spaceModules = { assertEnabled: jest.fn(async () => undefined) };
    const c = new CustomersController(authClient as any, spaceModules as any, {} as any, { customerChanged: jest.fn() } as any);
    await c.invite('c1', {}, { user: { id: 'u1', role: 'EMPLOYEE', organizationId: 'org-1' } });

    const payloadOf = (cmd: string) => (authClient.send.mock.calls as any[]).find(([p]) => p.cmd === cmd)?.[1];
    expect(payloadOf('get_customer').caller).toEqual({ userId: 'u1', role: 'EMPLOYEE' });
    expect(payloadOf('update_customer').caller).toEqual({ userId: 'u1', role: 'EMPLOYEE' });
    expect(spaceModules.assertEnabled).toHaveBeenCalledWith('s1', 'org-1', 'b2c_portal');
  });
});
