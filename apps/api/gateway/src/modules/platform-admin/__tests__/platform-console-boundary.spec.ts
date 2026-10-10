import 'reflect-metadata';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { INTERCEPTORS_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import { of } from 'rxjs';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PLATFORM_2FA_ENROLMENT_REQUIRED, platformHostAllowed } from '@hbcfield/shared';
import { PlatformAdminController } from '../platform-admin.controller';
import { PlatformAuthController, pickStaffPatch, pickStaffCreate } from '../platform-auth.controller';
import { PlatformSupportController, supportScopeOf } from '../platform-support.controller';
import { PlatformSupportTeamsController } from '../platform-support-teams.controller';
import { PlatformLibraryController } from '../platform-library.controller';
import { PlatformPricingController } from '../platform-pricing.controller';
import { PlatformAuthGuard } from '../../../common/guards/platform-auth.guard';
import { PlatformAdminGuard } from '../../../common/guards/platform-admin.guard';
import { PlatformAuditInterceptor, platformActor, platformShouldRecord } from '../../../common/interceptors/platform-audit.interceptor';
import { SupportController } from '../../support/support.controller';
import { BillingController } from '../../billing/billing.controller';
import { BlogController } from '../../blog/blog.controller';
import { AppUpdateNoticeController } from '../../app-version/app-version.controller';
import { SetAddOnsDto } from '../../billing/dto';

const PERM_KEY = 'platform_required_perm';
const permOf = (cls: any, method: string) => Reflect.getMetadata(PERM_KEY, cls.prototype[method]);

describe('operator console — server boundary', () => {
  describe('billing scope (billingOps, not manageOrgs)', () => {
    it('how an organization pays and what it has bought need billingOps', () => {
      expect(permOf(PlatformAdminController, 'setBillingMode')).toBe('billingOps');
      expect(permOf(PlatformAdminController, 'setAddOns')).toBe('billingOps');
      expect(permOf(PlatformAdminController, 'setAgreedPrice')).toBe('billingOps');
    });

    it('the audit trail is Owner-only (viewPlatformAudit)', () => {
      expect(permOf(PlatformAdminController, 'audit')).toBe('viewPlatformAudit');
    });

    it('add-ons: an omitted list is refused — it used to grant the whole catalogue', async () => {
      expect((await validate(plainToInstance(SetAddOnsDto, {}))).length).toBeGreaterThan(0);
      expect((await validate(plainToInstance(SetAddOnsDto, { addOns: ['nope'] }))).length).toBeGreaterThan(0);
      expect(await validate(plainToInstance(SetAddOnsDto, { addOns: ['invoicing'] }))).toHaveLength(0);
    });

    it('add-ons: passes the operator, the explicit list, and drops the org\'s cached sessions', async () => {
      const svc = { setAddOns: jest.fn().mockResolvedValue({ success: true, data: { id: 'o1' } }) };
      const cache = { invalidateOrganization: jest.fn().mockResolvedValue(undefined) };
      const ctrl = new PlatformAdminController(svc as any, cache as any);
      await ctrl.setAddOns('o1', { addOns: ['invoicing'] } as any, { platformUser: { id: 'op-7' } });
      expect(svc.setAddOns).toHaveBeenCalledWith({ organizationId: 'o1', addOns: ['invoicing'], byUserId: 'op-7' });
      expect(cache.invalidateOrganization).toHaveBeenCalledWith('o1');
    });
  });

  describe('staff edits', () => {
    it('the PATH id wins; only role/isActive travel; the actor comes from the session', () => {
      const p = pickStaffPatch('target', { id: 'other', role: 'SUPPORT', isActive: false, byUserId: 'forged', passwordHash: 'x' }, 'me');
      expect(p).toEqual({ id: 'target', role: 'SUPPORT', isActive: false, byUserId: 'me' });
    });

    it('a create picks the known fields only', () => {
      expect(pickStaffCreate({ email: 'a@b.c', password: 'p', role: 'OWNER', twoFactorEnabled: true, id: 'x' }, 'me')).toEqual({
        email: 'a@b.c', password: 'p', firstName: undefined, lastName: undefined, role: 'OWNER', byUserId: 'me',
      });
    });
  });

  describe('platform guard', () => {
    const ctx = (cls: any, method: string, req: any) => ({
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => cls.prototype[method],
      getClass: () => cls,
    }) as any;
    const client = (user: any) => ({ send: jest.fn(() => of({ valid: true, user, permissions: [], session: { iat: 1, authTime: 1 } })) });
    const req = (host = 'admin.hbcfield.com') => ({ headers: { authorization: 'Bearer t', host } });
    const enrolled = { id: 'op', role: 'OWNER', twoFactorEnabled: true, enrolmentRequired: false };
    const unenrolled = { id: 'op', role: 'OWNER', twoFactorEnabled: false, enrolmentRequired: true };
    const prev = process.env.PLATFORM_ALLOWED_HOSTS;
    afterEach(() => {
      if (prev === undefined) delete process.env.PLATFORM_ALLOWED_HOSTS;
      else process.env.PLATFORM_ALLOWED_HOSTS = prev;
    });

    it('an unenrolled session reaches /platform/auth/* (me, logout, 2FA) and nothing else', async () => {
      const g = new PlatformAuthGuard(client(unenrolled) as any, new Reflector());
      for (const m of ['me', 'logout', 'refresh', 'setup2fa', 'enable2fa', 'changePassword']) {
        await expect(g.canActivate(ctx(PlatformAuthController, m, req()))).resolves.toBe(true);
      }
      await expect(g.canActivate(ctx(PlatformAdminController, 'listOrgs', req()))).rejects.toMatchObject({
        response: expect.objectContaining({ code: PLATFORM_2FA_ENROLMENT_REQUIRED }),
      });
      await expect(g.canActivate(ctx(PlatformAuthController, 'listUsers', req()))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('an enrolled session passes to the capability check', async () => {
      const g = new PlatformAuthGuard(client(enrolled) as any, new Reflector());
      await expect(g.canActivate(ctx(PlatformAdminController, 'listOrgs', req()))).resolves.toBe(true);
    });

    it('PLATFORM_ALLOWED_HOSTS: another host is 404; unset allows any (local dev)', async () => {
      const g = new PlatformAuthGuard(client(enrolled) as any, new Reflector());
      process.env.PLATFORM_ALLOWED_HOSTS = 'admin.hbcfield.com';
      await expect(g.canActivate(ctx(PlatformAdminController, 'listOrgs', req('hbcfield.com')))).rejects.toBeInstanceOf(NotFoundException);
      await expect(g.canActivate(ctx(PlatformAdminController, 'listOrgs', req('ADMIN.hbcfield.com:443')))).resolves.toBe(true);
      delete process.env.PLATFORM_ALLOWED_HOSTS;
      await expect(g.canActivate(ctx(PlatformAdminController, 'listOrgs', req('localhost:4000')))).resolves.toBe(true);
    });

    it('the host rule itself', () => {
      expect(platformHostAllowed('x', undefined)).toBe(true);
      expect(platformHostAllowed(undefined, 'admin.hbcfield.com')).toBe(false);
      expect(platformHostAllowed('admin.hbcfield.com', 'a.com, admin.hbcfield.com')).toBe(true);
    });
  });

  describe('operator audit trail', () => {
    const icpt = new PlatformAuditInterceptor({ send: jest.fn(() => of({})) } as any);

    it('records a staff mutation with the target organization', () => {
      const row: any = icpt.buildRow(
        { method: 'POST', originalUrl: '/api/v1/platform/orgs/org-9/suspend', platformUser: { id: 'op-1', email: 'o@x', role: 'OWNER' }, headers: {}, body: {} },
        true, undefined, '/platform/orgs/:id/suspend',
      );
      expect(row).toMatchObject({ actorType: 'STAFF', actorId: 'op-1', action: 'ORG_SUSPENDED', targetOrganizationId: 'org-9', ok: true });
    });

    it('skips a staff read, but records every static-key call — reads included', () => {
      expect(icpt.buildRow({ method: 'GET', originalUrl: '/api/v1/platform/orgs', platformUser: { id: 'op' }, headers: {} }, true, undefined, '/platform/orgs')).toBeNull();
      const row: any = icpt.buildRow(
        { method: 'GET', originalUrl: '/api/v1/billing/admin/orgs', platformKeyVerified: true, headers: { 'x-support-agent': 'Lena' } },
        true, undefined, '/billing/admin/orgs',
      );
      expect(row).toMatchObject({ actorType: 'STATIC_KEY', actorLabel: 'Lena', action: 'STATIC_KEY_ORGS_LISTED' });
    });

    it('a sign-in attempt is recorded, its secrets redacted', () => {
      const row: any = icpt.buildRow(
        { method: 'POST', originalUrl: '/api/v1/platform/auth/login', headers: {}, body: { email: 'a@b.c', password: 'pw', code: '123456' } },
        false, { status: 401, message: 'Invalid' }, '/platform/auth/login',
      );
      expect(row).toMatchObject({ actorType: 'ANONYMOUS', action: 'PLATFORM_SIGN_IN', ok: false, statusCode: 401 });
      expect(row.summary.body).toEqual({ email: 'a@b.c', password: '[redacted]', code: '[redacted]' });
    });

    it('actor + record rules', () => {
      expect(platformActor({}).actorType).toBe('ANONYMOUS');
      expect(platformActor({ platformKeyVerified: true }).actorLabel).toBe('static-key');
      expect(platformShouldRecord('GET', 'STAFF')).toBe(false);
      expect(platformShouldRecord('GET', 'STATIC_KEY')).toBe(true);
    });

    it('the static-key guard marks the request it let through', () => {
      const r: any = { headers: { 'x-platform-admin-key': 'k' } };
      new PlatformAdminGuard({ get: () => 'k' } as any).assertKey(r);
      expect(r.platformKeyVerified).toBe(true);
    });

    const hasInterceptor = (cls: any, method?: string) => {
      const on = (t: any) => (Reflect.getMetadata(INTERCEPTORS_METADATA, t) ?? []).includes(PlatformAuditInterceptor);
      return on(cls) || (method ? on(cls.prototype[method]) : false);
    };

    it('every platform controller carries the interceptor', () => {
      for (const c of [PlatformAdminController, PlatformAuthController, PlatformSupportController, PlatformSupportTeamsController, PlatformLibraryController, PlatformPricingController]) {
        expect(hasInterceptor(c)).toBe(true);
      }
    });

    it('every static-key route carries it too (billing admin, support agent, blog writes, app-update notice)', () => {
      const keyRoutes: Array<[any, string]> = [];
      for (const cls of [BillingController, SupportController, BlogController, AppUpdateNoticeController, PlatformAuthController] as any[]) {
        for (const m of Object.getOwnPropertyNames(cls.prototype)) {
          if (m === 'constructor' || m === 'assertPlatformKey') continue;
          const src = String(cls.prototype[m]);
          const guarded = (Reflect.getMetadata(GUARDS_METADATA, cls.prototype[m]) ?? []).includes(PlatformAdminGuard);
          if (guarded || /assertPlatformKey\(/.test(src)) keyRoutes.push([cls, m]);
        }
      }
      expect(keyRoutes.length).toBeGreaterThanOrEqual(12);
      expect(keyRoutes.filter(([c, m]) => !hasInterceptor(c, m)).map(([c, m]) => `${c.name}.${m}`)).toEqual([]);
      // ...and is rate-limited (THROTTLER limit metadata on the method).
      const unthrottled = keyRoutes.filter(([c, m]) => !Reflect.getMetadataKeys(c.prototype[m]).some((k: string) => String(k).startsWith('THROTTLER:LIMIT')));
      expect(unthrottled.map(([c, m]) => `${c.name}.${m}`)).toEqual([]);
    });
  });

  describe('support scope travels with every ticket operation', () => {
    const scope = { isSupervisor: false, teamIds: ['t1'], platformUserId: 'op-3' };
    const req = { platformUser: { id: 'op-3', isSupportSupervisor: false, supportTeamIds: ['t1'] } };
    const ok = jest.fn().mockResolvedValue({ success: true, data: {} });
    const svc = { thread: ok, reply: ok, setStatus: ok, assign: ok, markRead: ok, inbox: ok };
    const ctrl = new PlatformSupportController(svc as any);
    beforeEach(() => ok.mockClear());

    it('resolved from the session, never the request', () => {
      expect(supportScopeOf(req)).toEqual(scope);
      expect(supportScopeOf({}).isSupervisor).toBe(false);
    });

    it('thread / reply / status / assign / read each pass it', async () => {
      await ctrl.thread('x', req);
      expect(svc.thread).toHaveBeenLastCalledWith('x', scope);
      await ctrl.reply('x', { body: 'hi' }, req);
      expect(svc.reply).toHaveBeenLastCalledWith(expect.objectContaining({ ticketId: 'x', authorId: 'op-3', scope }));
      await ctrl.status('x', { status: 'RESOLVED' }, req);
      expect(svc.setStatus).toHaveBeenLastCalledWith(expect.objectContaining({ scope }));
      await ctrl.assign('x', {}, req);
      expect(svc.assign).toHaveBeenLastCalledWith({ ticketId: 'x', agentId: 'op-3', scope });
      await ctrl.read('x', req);
      expect(svc.markRead).toHaveBeenLastCalledWith('x', scope);
    });
  });
});
