import fs from 'fs';
import path from 'path';
import { spaceRolesControllers } from './space-roles-controllers.fixture';

/*
  An external member's seat is priced from the permissions their SPACE role
  grants (Observer €2, Supervisor €9.99), so giving, changing or taking a space
  role — or editing what a role grants — moves the bill. These routes did not
  re-bill; the change reached Stripe only with the nightly sweep.
*/
describe('space-role routes re-bill', () => {
  const admin = { user: { id: 'a-1', role: 'ADMIN', organizationId: 'org-1', access: { org: {}, perSpace: {} } } };
  function ctrl(fail = false) {
    const answer = () => (fail ? Promise.reject(new Error('refused')) : Promise.resolve({ success: true }));
    const service = {
      assignMember: jest.fn(answer),
      removeMember: jest.fn(answer),
      updateMemberRoles: jest.fn(answer),
      updateRole: jest.fn(answer),
      deleteRole: jest.fn(answer),
      mergeRole: jest.fn(answer),
    };
    const billing = { rebill: jest.fn() };
    return { c: spaceRolesControllers(service as any, billing as any), billing };
  }

  it.each([
    ['assignMember', (c: any) => c.assignMember('s1', { userId: 'x', spaceRoleId: 'r' }, admin)],
    ['removeMember', (c: any) => c.removeMember('s1', 'm1', admin)],
    ['updateMemberRoles', (c: any) => c.updateMemberRoles('s1', 'm1', { managementRoleId: 'r' }, admin)],
    ['updateRole', (c: any) => c.updateRole('r', { name: 'X' }, admin)],
    ['deleteRole', (c: any) => c.deleteRole('r', admin)],
    ['mergeRole', (c: any) => c.mergeRole('r', { intoRoleId: 'q' }, admin)],
  ])('%s re-bills after success, and not after a refusal', async (_name, call) => {
    const ok = ctrl();
    await call(ok.c);
    expect(ok.billing.rebill).toHaveBeenCalledWith('org-1');

    const refused = ctrl(true);
    await expect(call(refused.c)).rejects.toThrow('refused');
    expect(refused.billing.rebill).not.toHaveBeenCalled();
  });

  it('one re-bill provider: no controller keeps its own copy of the message', () => {
    const modules = path.join(__dirname, '../..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== '__tests__') walk(full);
        } else if (e.name.endsWith('.ts') && fs.readFileSync(full, 'utf8').includes('billing_reconcile_seats')) {
          offenders.push(path.relative(modules, full));
        }
      }
    };
    walk(modules);
    expect(offenders).toEqual([]);
  });
});
