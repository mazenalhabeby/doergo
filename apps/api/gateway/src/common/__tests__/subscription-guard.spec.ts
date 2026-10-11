import fs from 'fs';
import path from 'path';
import 'reflect-metadata';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionGuard, ALLOW_WHEN_LOCKED_KEY } from '../guards/subscription.guard';
import { AttendanceController } from '../../modules/attendance/attendance.controller';

/**
 * The billing lock refuses writes — except the ones that END a member's own
 * running work. A lapsed card must never strand somebody inside a shift: a
 * refused clock-out leaves it open, counting, and nagging.
 */
const LOCKED = { subStatus: 'canceled', id: 'u1', organizationId: 'org-1' };

function run(handler: (...a: any[]) => any, req: any) {
  const guard = new SubscriptionGuard(new Reflector());
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => AttendanceController,
  } as any;
  return guard.canActivate(ctx);
}

const proto = AttendanceController.prototype as any;

describe('SubscriptionGuard — a locked organization', () => {
  it('lets a member clock OUT', () => {
    expect(run(proto.clockOut, { method: 'POST', path: '/api/v1/attendance/clock-out', user: LOCKED })).toBe(true);
  });

  it('lets a member answer "I forgot to clock out" and end their rest', () => {
    expect(run(proto.resolveForgotClockOut, { method: 'POST', path: '/api/v1/attendance/entries/e1/forgot-clock-out', user: LOCKED })).toBe(true);
    expect(run(proto.endBreak, { method: 'POST', path: '/api/v1/attendance/breaks/end', user: LOCKED })).toBe(true);
  });

  it('still refuses clock-IN with 402', () => {
    try {
      run(proto.clockIn, { method: 'POST', path: '/api/v1/attendance/clock-in', user: LOCKED });
      throw new Error('should have refused');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
    }
  });

  it('still refuses starting a rest, and a manager ending someone else’s', () => {
    expect(() => run(proto.startBreak, { method: 'POST', path: '/api/v1/attendance/breaks/start', user: LOCKED })).toThrow(HttpException);
    expect(() => run(proto.endBreakManually, { method: 'POST', path: '/api/v1/attendance/breaks/b1/end', user: LOCKED })).toThrow(HttpException);
  });

  it('ignores the marker on a CLASS — only a handler can carry it', () => {
    class Opened {
      write() {}
    }
    Reflect.defineMetadata(ALLOW_WHEN_LOCKED_KEY, true, Opened);
    const guard = new SubscriptionGuard(new Reflector());
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ method: 'POST', path: '/x', user: LOCKED }) }),
      getHandler: () => Opened.prototype.write,
      getClass: () => Opened,
    } as any;
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
  });

  it('does not change anything for a paying organization', () => {
    expect(run(proto.clockIn, { method: 'POST', path: '/api/v1/attendance/clock-in', user: { ...LOCKED, subStatus: 'active' } })).toBe(true);
  });
});

/*
 * Every route that passes the billing lock, by name. Adding the marker to a new
 * route fails here on purpose: whoever adds it must say why that write ENDS the
 * caller's own running work rather than starting something new.
 */
const ALLOWED_WHEN_LOCKED = [
  'attendance/attendance.controller.ts: clockOut',
  'attendance/attendance.controller.ts: endBreak',
  'attendance/attendance.controller.ts: resolveForgotClockOut',
];

const ROOT = path.join(__dirname, '../../modules');

function controllerFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...controllerFiles(full));
    else if (entry.name.endsWith('.controller.ts')) out.push(full);
  }
  return out;
}

describe('routes that pass the billing lock', () => {
  it('are exactly the known ones', () => {
    const found: string[] = [];
    for (const file of controllerFiles(ROOT)) {
      // Comments stripped first, so an example in a doc comment cannot count.
      const src = fs
        .readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      const re = /@AllowWhenLocked\(\)[\s\S]*?\basync\s+(\w+)\s*\(/g;
      for (let m = re.exec(src); m; m = re.exec(src)) {
        found.push(`${path.relative(ROOT, file)}: ${m[1]}`);
      }
    }
    expect(found.sort()).toEqual([...ALLOWED_WHEN_LOCKED].sort());
  });
});
