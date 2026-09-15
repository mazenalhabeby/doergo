import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ORG_NOTIFICATION_PREF_KEYS } from '@hbcfield/shared';
import { UpdateNotificationPrefsDto } from '../dto';

/**
 * The organization's notification switches reach the service.
 *
 * The DTO declared six names nobody sent while the Settings screen sent five
 * others, and the gateway validates with `whitelist` + `forbidNonWhitelisted`:
 * every save was a 400, and the switches that now decide whether three emails
 * go out could never have been changed. The screen, the validator and the
 * sender read one list in shared; this fails if the validator drifts from it.
 */
const check = (payload: Record<string, unknown>) =>
  validate(plainToInstance(UpdateNotificationPrefsDto, payload), { whitelist: true, forbidNonWhitelisted: true });

describe('UpdateNotificationPrefsDto', () => {
  it('accepts every key the organization settings may hold', async () => {
    const all = Object.fromEntries(ORG_NOTIFICATION_PREF_KEYS.map((k) => [k, false]));
    expect(await check(all)).toEqual([]);
  });

  it('refuses a value that is not a boolean', async () => {
    const errors = await check({ emailOnTaskAssigned: 'false' });
    expect(errors.map((e) => e.property)).toEqual(['emailOnTaskAssigned']);
  });

  it('refuses a key nothing reads', async () => {
    const errors = await check({ emailEnabled: true });
    expect(errors.map((e) => e.property)).toEqual(['emailEnabled']);
  });
});
