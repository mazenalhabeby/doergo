import { fakeServiceCalls } from '../../../common/testing/service-calls';
import { of } from 'rxjs';
import { CustomerInviteController } from '../customer-invite.controller';

import { fakeReq, fakeUser } from '../../../common/testing/fake-request';
/*
  POST /customers/:id/invite read and rewrote the client record as nobody in
  particular, so customers.service could not apply the caller's CRM caps or
  their ownership of the record. Both calls carry the caller now.
*/
describe('POST /customers/:id/invite', () => {
  it('passes the caller to get_customer and update_customer', async () => {
    const replies: Record<string, unknown> = {
      get_customer: { data: { id: 'c1', spaceId: 's1', email: 'a@b.at', name: 'BILLA AG', crmCaps: { manage: true } } },
      portal_list_units: [{ id: 'unit-1', portalId: 'p1', isPrimary: true }],
      create_invitation: { data: { code: 'ABCDEFGHJK' } },
      update_customer: { success: true },
    };
    const authClient = { send: jest.fn(({ cmd }: { cmd: string }) => of(replies[cmd] ?? {})) };
    const spaceModules = { assertEnabled: jest.fn(async () => undefined) };
    const c = new CustomerInviteController(
      fakeServiceCalls({ auth: authClient }),
      spaceModules as any,
      {} as any,
      { customerChanged: jest.fn() } as any,
    );
    await c.invite('c1', {}, fakeReq({ user: fakeUser({ id: 'u1', role: 'EMPLOYEE', organizationId: 'org-1' }) }));

    const payloadOf = (cmd: string) => (authClient.send.mock.calls as any[]).find(([p]) => p.cmd === cmd)?.[1];
    expect(payloadOf('get_customer').caller).toEqual({ userId: 'u1', role: 'EMPLOYEE' });
    expect(payloadOf('update_customer').caller).toEqual({ userId: 'u1', role: 'EMPLOYEE' });
    expect(spaceModules.assertEnabled).toHaveBeenCalledWith('s1', 'org-1', 'b2c_portal');
  });

  /*
    The invite is decided by the caps customers.service reports for THIS client
    (org ∪ the workspace it is filed in) — not by the org-wide flag, which would
    refuse a member whose manage right is a workspace's.
  */
  it('refuses a caller without manage on this client, before anything is written', async () => {
    const authClient = {
      send: jest.fn(({ cmd }: { cmd: string }) =>
        of(
          cmd === 'get_customer'
            ? {
                data: {
                  id: 'c1',
                  spaceId: 's1',
                  email: 'a@b.at',
                  name: 'BILLA AG',
                  crmCaps: { manage: false, view: 'all' },
                },
              }
            : {},
        ),
      ),
    };
    const c = new CustomerInviteController(
      fakeServiceCalls({ auth: authClient }),
      { assertEnabled: jest.fn() } as any,
      {} as any,
      { customerChanged: jest.fn() } as any,
    );
    await expect(
      c.invite('c1', {}, fakeReq({ user: fakeUser({ id: 'u1', role: 'EMPLOYEE', organizationId: 'org-1' }) })),
    ).rejects.toThrow('Not allowed');
    expect((authClient.send.mock.calls as any[]).map(([p]) => p.cmd)).toEqual(['get_customer']);
  });

  it('resend-invite reads the client as the caller first', async () => {
    const authClient = {
      send: jest.fn(({ cmd }: { cmd: string }) =>
        of(cmd === 'get_customer' ? { data: { id: 'c1', crmCaps: { manage: false } } } : { success: true }),
      ),
    };
    const c = new CustomerInviteController(
      fakeServiceCalls({ auth: authClient }),
      {} as any,
      {} as any,
      { customerChanged: jest.fn() } as any,
    );
    await expect(
      c.resendInvite('c1', fakeReq({ user: fakeUser({ id: 'u1', role: 'EMPLOYEE', organizationId: 'org-1' }) })),
    ).rejects.toThrow('Not allowed');
    expect((authClient.send.mock.calls as any[]).some(([p]) => p.cmd === 'resend_invitation')).toBe(false);
  });
});
