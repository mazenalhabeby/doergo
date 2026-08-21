import { HttpException, HttpStatus } from '@nestjs/common';
import { IS_PUBLIC_KEY, ADD_ON_KEYS } from '@hbcfield/shared';
import { PlanGuard } from '../guards/plan.guard';
import { PLAN_FEATURE_KEY } from '../decorators/require-plan.decorator';

/**
 * The gate on paid capabilities, after tiers were removed.
 *
 * It used to compare a tier against a static bundle table. Now it asks whether
 * the organization bought the thing. These assert the properties that decide
 * whether that is safe: it fails closed, it cannot be influenced by the caller,
 * and it never breaks reading data the customer already has.
 */
describe('PlanGuard — bought, or not', () => {
  const ctx = (req: any) => ({
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as any;

  const reflector = (feature?: string, isPublic = false) =>
    ({
      getAllAndOverride: (key: string) => (key === IS_PUBLIC_KEY ? isPublic : key === PLAN_FEATURE_KEY ? feature : undefined),
    }) as any;

  const guard = (feature?: string, isPublic = false) => new PlanGuard(reflector(feature, isPublic));

  it('allows a capability the organization bought', () => {
    const user = { orgAddOns: ['invoicing'] };
    expect(guard('invoicing').canActivate(ctx({ method: 'POST', user }))).toBe(true);
  });

  it('refuses one it did not, with 402 rather than 403', () => {
    // 402 is load-bearing: the client tells "you need to buy this" apart from
    // "you are not allowed", and shows an offer instead of an error.
    const user = { orgAddOns: ['recurring'] };
    try {
      guard('invoicing').canActivate(ctx({ method: 'POST', user }));
      throw new Error('should have refused');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
    }
  });

  it('names the add-on and its price, so the client can make a real offer', () => {
    // "Upgrade to Business" never said what it cost. This does.
    try {
      guard('invoicing').canActivate(ctx({ method: 'POST', user: { orgAddOns: [] } }));
      throw new Error('should have refused');
    } catch (e) {
      const body = (e as HttpException).getResponse() as any;
      expect(body.addOn?.key).toBe('invoicing');
      expect(body.addOn?.monthlyCents).toBeGreaterThan(0);
      expect(body.message).toContain('€');
    }
  });

  it('FAILS CLOSED on a key that is not a real add-on', () => {
    /*
      The important one. A typo in @RequirePlan('reccuring') must 402 and be
      noticed. An implementation that treats "unknown" as "not gated" hands
      every organization a paid feature and nothing ever reports it.
    */
    expect(() =>
      guard('reccuring').canActivate(ctx({ method: 'POST', user: { orgAddOns: ADD_ON_KEYS } })),
    ).toThrow(HttpException);
  });

  it('ignores anything the caller supplies that is not the resolved list', () => {
    // orgAddOns is set server-side by validateToken. A request that invents a
    // tier, a plan or its own entitlements must gain nothing by it.
    const forged = { planTier: 'enterprise', entitlements: ['invoicing'], addOns: ['invoicing'], orgAddOns: [] };
    expect(() => guard('invoicing').canActivate(ctx({ method: 'POST', user: forged }))).toThrow(HttpException);
  });

  it('treats a missing or malformed list as empty rather than as permission', () => {
    for (const orgAddOns of [undefined, null, 'invoicing', {}, 0]) {
      expect(() => guard('invoicing').canActivate(ctx({ method: 'POST', user: { orgAddOns } }))).toThrow(HttpException);
    }
  });

  it('never gates reads — removing an add-on must not hide existing data', () => {
    const user = { orgAddOns: [] };
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
      expect(guard('invoicing').canActivate(ctx({ method, user }))).toBe(true);
    }
  });

  it('passes a public route and a route with no requirement', () => {
    expect(guard('invoicing', true).canActivate(ctx({ method: 'POST', user: { orgAddOns: [] } }))).toBe(true);
    expect(guard(undefined).canActivate(ctx({ method: 'POST', user: { orgAddOns: [] } }))).toBe(true);
  });

  it('defers to the auth guards when there is no user at all', () => {
    // Not this guard's job to decide who you are; an unauthenticated request is
    // already refused upstream, and 402-ing it here would be a misleading answer.
    expect(guard('invoicing').canActivate(ctx({ method: 'POST' }))).toBe(true);
  });
});
