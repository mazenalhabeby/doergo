import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Throttle, ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';
import express from 'express';
import request from 'supertest';
import { Public } from '@hbcfield/shared';
import { SyncAwareThrottlerGuard } from '../throttler/sync-aware-throttler.guard';
import { MemberThrottlerGuard } from '../throttler/member-throttler.guard';
import {
  ANONYMOUS_THROTTLERS,
  BEARER_FLOOD_NET,
  MEMBER_THROTTLERS,
} from '../throttler/throttle-limits';
import { ipTracker, isMemberRequest } from '../throttler/request-identity';
import { INTERNAL_DISPATCH_HEADER, internalDispatchSecret } from '../throttler/internal-dispatch';

/**
 * Two families of rate limit: ANONYMOUS per IP (strict — login, refresh, the
 * password and invitation flows, every public route) and MEMBER per USER (a page
 * load's burst of reads fits). The guards run as they do in AppModule: the
 * anonymous one before JwtAuthGuard, the member one after it, on one storage.
 */

// Route doubles, decorated exactly as the real controllers are.
class AuthLikeController {
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login() {}

  @Public()
  validateInvitation() {}
}
class TasksLikeController {
  list() {}

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  sendSomething() {}
}

function ctx(
  handler: (...a: any[]) => any,
  cls: any,
  req: Record<string, any>,
): ExecutionContext {
  const res = { header: jest.fn() };
  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

const anon = (ip: string, extra: Record<string, any> = {}) => ({ ip, headers: {}, ...extra });
const member = (ip: string, userId: string | null) => ({
  ip,
  headers: { authorization: 'Bearer some.jwt.token' },
  ...(userId ? { user: { id: userId } } : {}),
});

async function hits(guard: { canActivate(c: ExecutionContext): Promise<boolean> }, c: () => ExecutionContext, n: number) {
  let ok = 0;
  let refused = 0;
  for (let i = 0; i < n; i++) {
    try {
      await guard.canActivate(c());
      ok++;
    } catch (e) {
      if (e instanceof ThrottlerException) refused++;
      else throw e;
    }
  }
  return { ok, refused };
}

describe('rate limits: anonymous per IP, members per user', () => {
  let storage: ThrottlerStorageService;
  let anonymous: SyncAwareThrottlerGuard;
  let members: MemberThrottlerGuard;
  const reflector = new Reflector();

  beforeEach(async () => {
    storage = new ThrottlerStorageService();
    const options = { throttlers: ANONYMOUS_THROTTLERS.map((t) => ({ ...t })) };
    anonymous = new SyncAwareThrottlerGuard(options, storage, reflector);
    members = new MemberThrottlerGuard(options, storage, reflector);
    await anonymous.onModuleInit();
    await members.onModuleInit();
  });
  afterEach(() => storage.onApplicationShutdown());

  /** Both guards in order, as AppModule runs them (JwtAuthGuard between them is a no-op here). */
  const both = {
    async canActivate(c: ExecutionContext) {
      await anonymous.canActivate(c);
      return members.canActivate(c);
    },
  };

  it('keeps the strict per-IP limit for an anonymous request (10 per second per route)', async () => {
    const r = await hits(both, () => ctx(TasksLikeController.prototype.list, TasksLikeController, anon('1.1.1.1')), 12);
    expect(r).toEqual({ ok: 10, refused: 2 });
    // Another IP has its own bucket.
    const other = await hits(both, () => ctx(TasksLikeController.prototype.list, TasksLikeController, anon('2.2.2.2')), 1);
    expect(other.ok).toBe(1);
  });

  it('leaves the login route unchanged — its own 5/min, per IP, even when a token is sent', async () => {
    const withToken = { ...member('3.3.3.3', 'u-1') };
    const r = await hits(both, () => ctx(AuthLikeController.prototype.login, AuthLikeController, withToken), 7);
    expect(r).toEqual({ ok: 5, refused: 2 });
    // A different user on the same IP is still the same anonymous caller.
    const r2 = await hits(both, () => ctx(AuthLikeController.prototype.login, AuthLikeController, member('3.3.3.3', 'u-2')), 1);
    expect(r2.refused).toBe(1);
  });

  it('treats any @Public route as anonymous', () => {
    const c = ctx(AuthLikeController.prototype.validateInvitation, AuthLikeController, member('4.4.4.4', 'u-1'));
    expect(isMemberRequest(c, reflector)).toBe(false);
    const c2 = ctx(TasksLikeController.prototype.list, TasksLikeController, member('4.4.4.4', 'u-1'));
    expect(isMemberRequest(c2, reflector)).toBe(true);
    const c3 = ctx(TasksLikeController.prototype.list, TasksLikeController, anon('4.4.4.4'));
    expect(isMemberRequest(c3, reflector)).toBe(false);
  });

  it('lets a signed-in page load through: 25 reads of one route in a second pass', async () => {
    const r = await hits(both, () => ctx(TasksLikeController.prototype.list, TasksLikeController, member('5.5.5.5', 'u-1')), 25);
    expect(r).toEqual({ ok: 25, refused: 0 });
  });

  it('counts a member per USER: past the burst allowance the same user is refused, a colleague behind the same NAT is not', async () => {
    const short = MEMBER_THROTTLERS.find((t) => t.name === 'short')!.limit as number;
    const r = await hits(both, () => ctx(TasksLikeController.prototype.list, TasksLikeController, member('6.6.6.6', 'u-1')), short + 2);
    expect(r).toEqual({ ok: short, refused: 2 });
    const colleague = await hits(both, () => ctx(TasksLikeController.prototype.list, TasksLikeController, member('6.6.6.6', 'u-2')), short);
    expect(colleague).toEqual({ ok: short, refused: 0 });
  });

  it('follows the member across IPs (one bucket for one user)', async () => {
    const short = MEMBER_THROTTLERS.find((t) => t.name === 'short')!.limit as number;
    let ip = 0;
    const r = await hits(both, () => ctx(TasksLikeController.prototype.list, TasksLikeController, member(`10.0.0.${ip++}`, 'u-9')), short + 1);
    expect(r.refused).toBe(1);
  });

  it('still applies a route’s own @Throttle to a member, per user', async () => {
    const r = await hits(both, () => ctx(TasksLikeController.prototype.sendSomething, TasksLikeController, member('7.7.7.7', 'u-1')), 4);
    expect(r).toEqual({ ok: 3, refused: 1 });
    const other = await hits(both, () => ctx(TasksLikeController.prototype.sendSomething, TasksLikeController, member('7.7.7.7', 'u-2')), 1);
    expect(other.ok).toBe(1);
  });

  it('member guard does nothing without a validated user (never trusts an unverified token)', async () => {
    const r = await hits(members, () => ctx(TasksLikeController.prototype.list, TasksLikeController, member('8.8.8.8', null)), 100);
    expect(r.refused).toBe(0);
  });

  it('nets a flood of bearer requests from one IP before the token is validated', async () => {
    const net = BEARER_FLOOD_NET.find((t) => t.name === 'net-short')!.limit as number;
    let n = 0;
    // Made-up tokens, a different "user" each time: only the IP net can stop them.
    const r = await hits(anonymous, () => ctx(TasksLikeController.prototype.list, TasksLikeController, member('9.9.9.9', `fake-${n++}`)), net + 3);
    expect(r).toEqual({ ok: net, refused: 3 });
  });

  it('skips the gateway’s own replay of a phone’s queue in both guards', async () => {
    const req = { ...member('11.11.11.11', 'u-1'), headers: { authorization: 'Bearer x', [INTERNAL_DISPATCH_HEADER]: internalDispatchSecret() } };
    const r = await hits(both, () => ctx(TasksLikeController.prototype.list, TasksLikeController, req), 200);
    expect(r.refused).toBe(0);
  });

  it('member limits are looser than anonymous ones, tier for tier', () => {
    for (const name of ['short', 'medium', 'long', 'default']) {
      const a = ANONYMOUS_THROTTLERS.find((t) => t.name === name)!;
      const m = MEMBER_THROTTLERS.find((t) => t.name === name)!;
      expect(m.ttl).toBe(a.ttl);
      expect(m.limit as number).toBeGreaterThan(a.limit as number);
    }
    // The fourth throttler must be named 'default', or every @Throttle override is ignored.
    expect(ANONYMOUS_THROTTLERS.map((t) => t.name)).toContain('default');
    expect(MEMBER_THROTTLERS.map((t) => t.name)).toContain('default');
  });
});

describe('the anonymous tracker is the real client IP behind Cloudflare + nginx', () => {
  it('reads req.ip, which Express takes from X-Forwarded-For under trust proxy', async () => {
    const app = express();
    app.set('trust proxy', 1); // as main.ts
    app.get('/t', (req, res) => res.json({ tracker: ipTracker(req as any) }));
    // nginx: real_ip_header CF-Connecting-IP → $remote_addr → X-Forwarded-For.
    const res = await request(app).get('/t').set('X-Forwarded-For', '203.0.113.7');
    expect(res.body.tracker).toBe('ip:203.0.113.7');
  });

  it('does not let a client prepend its own X-Forwarded-For hop', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.get('/t', (req, res) => res.json({ tracker: ipTracker(req as any) }));
    const res = await request(app).get('/t').set('X-Forwarded-For', '6.6.6.6, 203.0.113.7');
    expect(res.body.tracker).toBe('ip:203.0.113.7');
  });
});
