import { HttpStatus } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import fs from 'fs';
import path from 'path';
import { SpaceModulesService } from '../space-modules.service';

/*
  Four controllers (space units, space portal, space sharing, customers) each
  looked a space's modules up by hand and refused with a 403 of their own
  wording, so the web's upgrade prompt — keyed on 402 + `feature` — never fired
  for them. They now ask SpaceModulesService.assertEnabled: the guard's cache,
  the guard's 402.
*/
describe('SpaceModulesService.assertEnabled', () => {
  const svc = (reply: any) => new SpaceModulesService({ send: jest.fn(() => reply) } as any);

  it('passes when the module is on in the space', async () => {
    await expect(svc(of({ data: { enabledModules: ['crm'] } })).assertEnabled('s1', 'o1', 'crm')).resolves.toBeUndefined();
  });

  it('refuses with the guard\'s 402 when it is off', async () => {
    const err: any = await svc(of({ data: { enabledModules: [] } })).assertEnabled('s1', 'o1', 'b2c_portal').catch((e) => e);
    expect(err.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
    expect(err.getResponse()).toMatchObject({ error: 'ModuleDisabled', feature: 'b2c_portal' });
  });

  it('an unknown space is a failure to report, never a permission', async () => {
    const err: any = await svc(throwError(() => new Error('down'))).assertEnabled('s1', 'o1', 'crm').catch((e) => e);
    expect(err.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });

  it.each([
    'portal/space-units.controller.ts',
    'portal/space-portal.controller.ts',
    'space-sharing/space-sharing.controller.ts',
    'customers/customers.controller.ts',
  ])('%s looks no modules up by hand', (file) => {
    const src = fs.readFileSync(path.join(__dirname, '../../modules', file), 'utf8');
    expect(src).not.toMatch(/get_effective_modules/);
  });
});
