import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ADD_ON_KEYS } from '@hbcfield/shared';
import { SetAddOnsDto } from '../dto';

/**
 * The body that decides what an organization pays for.
 *
 * Validated at the edge as well as in the service, because this is the one
 * request in the product that changes a bill. A key that reaches storage
 * unvalidated sits on the organization looking like an entitlement until
 * somebody ships a real add-on with that name — and then it silently becomes one.
 */
const check = async (body: unknown) => validate(plainToInstance(SetAddOnsDto, body));

describe('PUT /billing/add-ons — the body', () => {
  it('accepts a list of real add-ons', async () => {
    expect(await check({ addOns: ['invoicing', 'workflows'] })).toHaveLength(0);
  });

  it('accepts an empty list — that is how you buy nothing', async () => {
    expect(await check({ addOns: [] })).toHaveLength(0);
  });

  it('accepts every key in the catalogue', async () => {
    expect(await check({ addOns: ADD_ON_KEYS })).toHaveLength(0);
  });

  it('refuses a key that is not an add-on', async () => {
    expect((await check({ addOns: ['invoicing', 'free_money'] })).length).toBeGreaterThan(0);
  });

  it('refuses a MODULE key — modules are bought per space, not here', async () => {
    // 'crm' is real, priced and purchasable — just not through this route.
    // Accepting it would bill an org-wide add-on for a per-space module.
    expect((await check({ addOns: ['crm'] })).length).toBeGreaterThan(0);
  });

  it('refuses duplicates, which would double an invoice line', async () => {
    expect((await check({ addOns: ['invoicing', 'invoicing'] })).length).toBeGreaterThan(0);
  });

  it('refuses anything that is not an array of strings', async () => {
    for (const addOns of ['invoicing', 42, { invoicing: true }, [1, 2], [null]]) {
      expect((await check({ addOns })).length).toBeGreaterThan(0);
    }
  });

  it('refuses a missing list rather than treating it as empty', async () => {
    // Silently clearing every add-on because a field was omitted would cancel
    // paid features on a malformed request.
    expect((await check({})).length).toBeGreaterThan(0);
  });
})
