import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ListMembersQueryDto } from '../dto';

/**
 * The members role filter, which validation quietly broke.
 *
 * The dropdown offers three kinds of value — the account types, the ids of
 * roles the organization created, and `none` for members holding no role — but
 * the DTO validated `@IsEnum(['ADMIN','EMPLOYEE'])`. Everything else 400'd
 * before the service saw it, so every custom role in the list was unselectable
 * and "No role" returned an error instead of the members it describes.
 *
 * The service had already been written to handle all three. Only the gateway
 * disagreed, which is the failure this file exists to catch: a filter is a
 * contract between a dropdown, a validator and a query, and the validator is
 * the one nobody looks at.
 */
const check = async (payload: Record<string, unknown>) =>
  validate(plainToInstance(ListMembersQueryDto, payload));

describe('ListMembersQueryDto — role', () => {
  it('accepts the account types', async () => {
    expect(await check({ role: 'ADMIN' })).toEqual([]);
    expect(await check({ role: 'EMPLOYEE' })).toEqual([]);
    expect(await check({ role: 'CUSTOMER' })).toEqual([]);
  });

  it('accepts "none" — the members holding no role at all', async () => {
    expect(await check({ role: 'none' })).toEqual([]);
  });

  it('accepts an access-role id, which is what the org’s own roles are', async () => {
    expect(await check({ role: 'cmsp5r8fy0002o101lcvovezs' })).toEqual([]);
  });

  it('omits cleanly — no filter is the default view', async () => {
    expect(await check({})).toEqual([]);
  });

  it('refuses a value too long to be any id', async () => {
    expect(await check({ role: 'x'.repeat(65) })).not.toEqual([]);
  });

  it('refuses a non-string', async () => {
    expect(await check({ role: 42 })).not.toEqual([]);
  });
});
