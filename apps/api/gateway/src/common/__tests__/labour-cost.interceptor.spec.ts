import { ForbiddenException } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { LabourCostInterceptor } from '../interceptors/labour-cost.interceptor';

/**
 * What labour COSTS reaches only the people allowed to see it — in and out.
 *
 * Managing a workspace's people is not the same as being allowed to see what
 * their hours cost the company. The interceptor sits on whole controllers so a
 * route added next year is covered without anybody remembering to strip it.
 */
describe('LabourCostInterceptor', () => {
  const ctx = (user: unknown, body: unknown = {}) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user, body }) }) }) as any;
  const run = (user: unknown, payload: unknown, body?: unknown) =>
    lastValueFrom(new LabourCostInterceptor().intercept(ctx(user, body), { handle: () => of(payload) }));

  const payload = {
    success: true,
    data: [
      { id: 'a1', billRateCents: 8500, costRateCents: 2500, user: { id: 'u', costRateCents: 2000 } },
      { id: 's1', billableRateCents: 6000, costRateCents: 3000, twoRates: true },
    ],
  };

  it('strips every cost, at any depth, for a manager without the permission', async () => {
    const out: any = await run({ role: 'MANAGER', access: { org: { canManageUsers: true } } }, payload);
    expect(JSON.stringify(out)).not.toContain('costRateCents');
    expect(out.data[0].billRateCents).toBe(8500);
    expect(out.data[1].twoRates).toBe(false);
  });

  it('leaves it for somebody allowed to see labour cost, and for an admin', async () => {
    expect(await run({ role: 'MANAGER', access: { org: { canViewLabourCost: true } } }, payload)).toBe(payload);
    expect(await run({ role: 'ADMIN' }, payload)).toBe(payload);
  });

  it('refuses a body that tries to SET a cost without the permission', () => {
    expect(() =>
      new LabourCostInterceptor().intercept(ctx({ role: 'MANAGER' }, { costRateCents: 100 }), { handle: () => of({}) }),
    ).toThrow(ForbiddenException);
  });

  it('a body without a cost passes', async () => {
    await expect(run({ role: 'MANAGER' }, { ok: 1 }, { billRateCents: 100 })).resolves.toEqual({ ok: 1 });
  });
});
