/**
 * Who the documents service is told the caller is.
 *
 * This helper is small and load-bearing: it is the single place the gateway
 * decides what a caller may do with somebody's payslip, and it has to agree
 * with `PermissionsGuard` exactly. Where the two disagree, a request is either
 * refused after being allowed (a phantom 403) or — far worse — allowed after
 * being refused.
 */
import { Reflector } from '@nestjs/core';
import { HttpStatus } from '@nestjs/common';
import { documentActor, requestContext } from '../documents.actor';
import { PlanGuard } from '../../../common/guards/plan.guard';
import { PLAN_FEATURE_KEY } from '../../../common/decorators/require-plan.decorator';
import { IS_PUBLIC_KEY } from '@hbcfield/shared';
import { isAddOn, addOnDef } from '@hbcfield/shared';
import type { CurrentUserData } from '@hbcfield/shared';

const base = (over: Partial<CurrentUserData> = {}): CurrentUserData =>
  ({
    id: 'u1',
    email: 'm@example.com',
    firstName: 'Monika',
    lastName: 'Holub',
    role: 'EMPLOYEE',
    organizationId: 'org1',
    onboardingCompleted: true,
    canCreateTasks: false,
    canViewAllTasks: false,
    canAssignTasks: false,
    canManageUsers: false,
    ...over,
  }) as CurrentUserData;

describe('documentActor', () => {
  it('grants nothing to an ordinary member', () => {
    const a = documentActor(base());
    expect(a).toMatchObject({
      userId: 'u1',
      organizationId: 'org1',
      canViewMemberDocuments: false,
      canOpenMemberDocuments: false,
      canIssueDocuments: false,
      canManageDocumentTemplates: false,
    });
  });

  it('does NOT infer document access from canManageUsers', () => {
    // The whole point of the four keys. A manager who can invite and remove
    // colleagues must not thereby be able to read their salaries.
    const a = documentActor(base({ canManageUsers: true }));
    expect(a.canOpenMemberDocuments).toBe(false);
    expect(a.canViewMemberDocuments).toBe(false);
    expect(a.canIssueDocuments).toBe(false);
  });

  it('passes through each granted permission independently', () => {
    const a = documentActor(base({ canViewMemberDocuments: true }));
    // Seeing that a document exists must not imply being able to open it.
    expect(a.canViewMemberDocuments).toBe(true);
    expect(a.canOpenMemberDocuments).toBe(false);
  });

  it('gives an ADMIN everything, matching PermissionsGuard’s bypass', () => {
    // PermissionsGuard returns true for isAdmin() without consulting a flag.
    // If this helper were stricter, an admin would be refused by the service
    // on a route the guard had just allowed.
    const a = documentActor(base({ role: 'ADMIN' }));
    expect(a.canViewMemberDocuments).toBe(true);
    expect(a.canOpenMemberDocuments).toBe(true);
    expect(a.canIssueDocuments).toBe(true);
    expect(a.canManageDocumentTemplates).toBe(true);
  });

  it('treats the legacy CLIENT role as admin, as the rest of the system does', () => {
    expect(documentActor(base({ role: 'CLIENT' })).canIssueDocuments).toBe(true);
  });

  it('never produces a null organization scope', () => {
    // An empty string matches nothing in a WHERE clause; null or undefined
    // would be dropped by Prisma and match EVERY row across every tenant.
    const a = documentActor(base({ organizationId: null }));
    expect(a.organizationId).toBe('');
  });
});

describe('requestContext', () => {
  it('takes provenance from the request, never from the body', () => {
    const ctx = requestContext({
      ip: '84.115.20.11',
      headers: { 'user-agent': 'HBCField/1.0.2 iOS', 'x-app-version': '1.0.2' },
    });
    expect(ctx).toEqual({
      ip: '84.115.20.11',
      userAgent: 'HBCField/1.0.2 iOS',
      appVersion: '1.0.2',
    });
  });

  it('falls back to the socket address when the framework gives no ip', () => {
    expect(requestContext({ socket: { remoteAddress: '10.0.0.4' } }).ip).toBe('10.0.0.4');
  });

  it('records null rather than inventing a value', () => {
    expect(requestContext({})).toEqual({ ip: null, userAgent: null, appVersion: null });
  });

  it('ignores a header that is not a plain string', () => {
    // Node hands back an array for a repeated header; a trail entry must not
    // record "[object Object]" as the device it came from.
    expect(requestContext({ headers: { 'user-agent': ['a', 'b'] } }).userAgent).toBeNull();
  });

  it('caps header length so a trail row cannot be stuffed', () => {
    const ctx = requestContext({ headers: { 'user-agent': 'x'.repeat(5000) } });
    expect(ctx.userAgent).toHaveLength(200);
  });
});

describe('the documents add-on gate', () => {
  const guard = new PlanGuard(new Reflector());

  const ctx = (method: string, orgAddOns: string[]) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ method, user: { orgAddOns } }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as any;

  beforeEach(() => {
    // Keyed off the exported constants, not string literals. A literal that no
    // longer matches makes the guard read no feature at all and return true —
    // so every assertion below would pass while testing nothing.
    jest
      .spyOn(Reflector.prototype, 'getAllAndOverride')
      .mockImplementation((key: any) => {
        if (key === PLAN_FEATURE_KEY) return 'documents' as any;
        if (key === IS_PUBLIC_KEY) return false as any;
        return undefined as any;
      });
  });
  afterEach(() => jest.restoreAllMocks());

  it('is a real add-on key, so the guard cannot fail closed on a typo', () => {
    // PlanGuard 402s any key it does not recognise. That is correct behaviour
    // and exactly why the catalogue entry has to exist before the decorator.
    expect(isAddOn('documents')).toBe(true);
    expect(addOnDef('documents')?.monthlyCents).toBe(1900);
  });

  it('actually reads the decorator — guards the guard-test itself', () => {
    // Without this, a stale metadata key would make every case below "pass".
    expect(new Reflector().getAllAndOverride(PLAN_FEATURE_KEY, [])).toBe('documents');
  });

  it('lets an organization that bought it through', () => {
    expect(guard.canActivate(ctx('POST', ['documents']))).toBe(true);
  });

  it('402s a mutation for an organization that has not', () => {
    // Captured rather than caught inside a try/catch that could also swallow
    // the "it did not throw" failure — which is exactly what it did first time.
    let thrown: any;
    expect(() => {
      try {
        guard.canActivate(ctx('POST', ['invoicing']));
      } catch (e) {
        thrown = e;
        throw e;
      }
    }).toThrow();

    expect(thrown.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
    // Names the thing and its price, so the client can render a real offer.
    expect(thrown.getResponse().addOn).toMatchObject({
      key: 'documents',
      monthlyCents: 1900,
    });
  });

  it('still lets READS through without the add-on', () => {
    // Cancelling must never lock somebody out of their own employment records.
    expect(guard.canActivate(ctx('GET', []))).toBe(true);
  });
});
