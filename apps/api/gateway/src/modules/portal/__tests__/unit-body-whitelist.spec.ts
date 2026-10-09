import fs from 'fs';
import path from 'path';
import { pickUnitFields } from '@hbcfield/shared';

/**
 * A unit write can never carry identity from the body.
 *
 * Two routes sent `{ id, organizationId: <token>, …, ...rest }` with an untyped
 * body spread LAST, so `"organizationId": "<other org>"` in the body edited
 * another tenant's unit. The shared `body-cannot-override-caller` scan looks for
 * `...body` — not `...rest`, which is how both of these were written.
 */
describe('pickUnitFields', () => {
  const hostile = {
    organizationId: 'org-B', id: 'unit-B', actorId: 'someone', scopeCustomerId: 'c-B',
    crmCaller: { userId: 'x', role: 'ADMIN' }, __proto__: { name: 'polluted' },
    name: 'Flat 2', lat: 1, spaceId: 's1', customerId: 'c1',
  };

  it('keeps editable fields and drops every identity field', () => {
    const out = pickUnitFields(hostile) as Record<string, unknown>;
    for (const k of ['organizationId', 'id', 'actorId', 'scopeCustomerId', 'crmCaller']) expect(k in out).toBe(false);
    expect(out).toEqual({ name: 'Flat 2', lat: 1, spaceId: 's1', customerId: 'c1' });
  });

  it('the CRM address surface cannot move a unit to another client, space or portal', () => {
    expect(pickUnitFields(hostile, { relations: false })).toEqual({ name: 'Flat 2', lat: 1 });
  });

  it('survives a body that is not an object', () => {
    expect(pickUnitFields(null)).toEqual({});
    expect(pickUnitFields(['name'])).toEqual({});
  });
});

describe('unit routes in the gateway', () => {
  const ROOT = path.join(__dirname, '../..');
  const FILES = [
    'portal/space-units.controller.ts',
    'portal/space-portal.controller.ts',
    'portal/portal-admin.controller.ts',
    'customers/customers.controller.ts',
  ];
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it.each(FILES)('%s builds unit writes from pickUnitFields, identity last', (file) => {
    const code = strip(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    const writes = code.split(/this\.auth\('portal_(?:create|update)_unit',/).slice(1);
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) {
      // The payload literal: from its `{` to the brace that closes it.
      const start = w.indexOf('{');
      let depth = 0;
      let end = start;
      for (; end < w.length; end++) {
        if (w[end] === '{') depth++;
        else if (w[end] === '}' && --depth === 0) break;
      }
      const payload = w.slice(start, end + 1);
      // No raw spread of anything from the request.
      expect(payload).not.toMatch(/\.\.\.(body|rest|dto|input)\b/);
      const org = payload.indexOf('organizationId');
      expect(org).toBeGreaterThan(-1);
      const pick = payload.indexOf('pickUnitFields(');
      if (pick !== -1) expect(pick).toBeLessThan(org);
    }
  });

  it('every CRM address write carries the caller, so the service can ask the reach rule', () => {
    const code = strip(fs.readFileSync(path.join(ROOT, 'customers/customers.controller.ts'), 'utf8'));
    for (const cmd of ['portal_create_unit', 'portal_update_unit', 'portal_set_primary_unit', 'portal_delete_unit']) {
      const at = code.indexOf(`'${cmd}'`);
      expect(at).toBeGreaterThan(-1);
      expect(code.slice(at, code.indexOf('});', at))).toContain('crmCaller: this.caller(req)');
    }
  });
});

describe('no ...rest spread after the caller in the controllers this audit owns', () => {
  /*
    Widening the shared scan's BODY_SPREAD to \`rest\` is left to whoever owns
    common/__tests__; this covers the modules fixed here.
  */
  const DIRS = ['customers', 'portal', 'invoices', 'geo', 'blog', 'billing', 'platform-admin'];
  const IDENTITY = /(req\.user\b|request\.user\b|\buser\.(id|organizationId|role)\b|this\.actor\()/;
  const SPREAD = /\.\.\.(body|dto|input|payload|rest|data)\b/;
  it('spreads request data only BEFORE identity', () => {
    const offenders: string[] = [];
    for (const d of DIRS) {
      const dir = path.join(__dirname, '../..', d);
      for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.controller.ts'))) {
        const code = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        for (const lit of code.match(/\{[^{}]*\}/g) ?? []) {
          const s = lit.search(SPREAD);
          const i = lit.search(IDENTITY);
          if (s !== -1 && i !== -1 && i < s) offenders.push(`${d}/${f}: ${lit.replace(/\s+/g, ' ').slice(0, 120)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
