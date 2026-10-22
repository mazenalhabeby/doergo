/**
 * WHO SEES THE SHIFT CLOCK — the widget, the Clock tab and the server's
 * clock-in door must answer the same question about the same member.
 *
 * The personas are the dev database's own rows (2026-09-26), not invented
 * shapes: `enabledModules` exactly as stored, so a change to how a stored
 * profile is read shows up here as a named person losing or gaining a clock.
 *
 * Verified live against the dev API the same day:
 *   karim (tasks only)        → POST /attendance/clock-in 403 "does not include the clock feature"
 *   manager (EMPLOYEE, [])    → 403, same
 *   a.test (EXTERNAL, tasks)  → 403, same
 *   noor (clock)              → 201, and clocked out again
 * so the phone hiding the card from those three is the server's answer, not
 * a stricter one.
 */
import * as fs from 'fs';
import * as path from 'path';
import { hasAccessModule } from '@hbcfield/shared/client';
import { meets } from '@/features/home/entitlement';
import { readSource } from '@/test-utils/read-source';

const SRC = path.resolve(__dirname, '../..');
const APP = path.resolve(__dirname, '../../../app');
const code = (p: string) =>
  readSource(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** The registry row, as written in `features/home/registry.tsx`. */
const SHIFT = { module: 'clock' as const, internal: true as const, self: true as const };

const profile = (modules: string[]) => ({ modules, platforms: 'both', canContact: true, spaceScope: 'own' });

const PEOPLE = {
  client: { id: 'u-client', role: 'ADMIN', enabledModules: null, isExternal: false },
  sarah: { id: 'emp-sarah', role: 'ADMIN', enabledModules: profile([]), isExternal: false },
  manager: { id: 'emp-manager', role: 'EMPLOYEE', enabledModules: profile([]), isExternal: false, canViewAllTasks: true, canAssignTasks: true },
  noor: { id: 'emp-noor', role: 'EMPLOYEE', enabledModules: profile(['clock', 'time_off']), isExternal: false },
  karim: { id: 'emp-karim', role: 'EMPLOYEE', enabledModules: profile(['tasks', 'time_off']), isExternal: false },
  mike: { id: 'emp-mike', role: 'EMPLOYEE', enabledModules: profile(['tasks', 'clock', 'time_off']), isExternal: false },
  external: { id: 'u-ext', role: 'EMPLOYEE', enabledModules: profile(['tasks']), isExternal: true },
} as const;

/** The tab bar's rule, exactly: `hasAccessModule(user || {}, 'clock')`. */
const clockTab = (u: object) => hasAccessModule(u as never, 'clock');

describe('the registry row asks what the tab asks', () => {
  it('registry: shift-clock requires { module: clock, internal, self }', () => {
    const reg = code(path.join(SRC, 'features/home/registry.tsx'));
    const row = reg.slice(reg.indexOf("key: 'shift-clock'"), reg.indexOf("key: 'shift-clock'") + 400);
    expect(row).toMatch(/requires:\s*\{\s*module:\s*'clock',\s*internal:\s*true,\s*self:\s*true\s*\}/);
  });

  it('tabs: the Clock tab is gated by hasAccessModule(…, "clock") ONCE, and the bar and the navigator both read it', () => {
    const tabs = code(path.join(SRC, 'lib/tab-layout.ts'));
    const asks = tabs.match(/hasAccessModule\(u, 'clock'\)/g) ?? [];
    expect(asks.length).toBe(1);
    const layout = code(path.join(APP, '(app)/(tabs)/_layout.tsx'));
    expect(layout.match(/tabAccessFor\(/g)?.length).toBe(2);
    // and never the raw storage reader, which is the drift entitlement.ts names
    expect(tabs).not.toMatch(/hasModule\(user[^)]*'clock'\)/);
  });

  it('entitlement: meets() reads hasAccessModule, never hasModule', () => {
    const ent = code(path.join(SRC, 'features/home/entitlement.ts'));
    expect(ent).toMatch(/hasAccessModule\(user as never, r\.module\)/);
    expect(ent).not.toMatch(/\bhasModule\(/);
  });
});

describe('each persona — widget, tab, and what the server said', () => {
  const cases: [keyof typeof PEOPLE, boolean][] = [
    ['client', true], // ADMIN, no profile stored
    ['sarah', true], // ADMIN with an EMPTY list — admin holds every module by definition
    ['manager', false], // EMPLOYEE with [] — an explicit empty profile holds nothing (server 403)
    ['noor', true], // clock-only
    ['karim', false], // tasks-only (server 403)
    ['mike', true],
    ['external', false], // external — never, whatever they hold (server 403)
  ];
  it.each(cases)('%s → widget %s', (who, expected) => {
    expect(meets(PEOPLE[who] as never, SHIFT)).toBe(expected);
  });

  it.each(cases.filter(([w]) => w !== 'external'))('%s → the Clock tab agrees with the widget', (who) => {
    expect(clockTab(PEOPLE[who])).toBe(meets(PEOPLE[who] as never, SHIFT));
  });

  it('an EMPTY list is not "no profile": [] holds nothing, null holds everything', () => {
    const member = { role: 'EMPLOYEE', isExternal: false };
    expect(meets({ ...member, enabledModules: null } as never, SHIFT)).toBe(true);
    expect(meets({ ...member } as never, SHIFT)).toBe(true);
    expect(meets({ ...member, enabledModules: profile([]) } as never, SHIFT)).toBe(false);
    // the legacy bare-array storage form is PERMISSIVE, as `modules.ts`
    // documents for every access check — and the tab reads it the same way
    const legacy = { ...member, enabledModules: ['tasks'] };
    expect(meets(legacy as never, SHIFT)).toBe(clockTab(legacy));
  });

  it('role is case-insensitive and legacy CLIENT is an admin', () => {
    expect(meets({ role: 'admin', enabledModules: profile([]) } as never, SHIFT)).toBe(true);
    expect(meets({ role: 'CLIENT', enabledModules: profile([]) } as never, SHIFT)).toBe(true);
  });

  it('isExternal must be exactly true — a session from an older server is internal', () => {
    const base = { role: 'EMPLOYEE', enabledModules: profile(['clock']) };
    expect(meets({ ...base, isExternal: undefined } as never, SHIFT)).toBe(true);
    expect(meets({ ...base, isExternal: null } as never, SHIFT)).toBe(true);
    expect(meets({ ...base, isExternal: true } as never, SHIFT)).toBe(false);
  });

  it('an external member with clock somehow in their list is still refused the card', () => {
    // The invite and edit paths strip `clock` from external profiles; the card
    // does not rely on that.
    expect(meets({ role: 'EMPLOYEE', isExternal: true, enabledModules: profile(['clock']) } as never, SHIFT)).toBe(false);
    expect(meets({ role: 'ADMIN', isExternal: true, enabledModules: null } as never, SHIFT)).toBe(false);
  });

  it('nobody signed in sees nothing', () => {
    expect(meets(null, SHIFT)).toBe(false);
    expect(meets(undefined, SHIFT)).toBe(false);
  });
});

describe('the card only offers clocking the server accepts', () => {
  it('the clock-in door is gated by the same access module, and clock-out is not', () => {
    const ctl = code(path.resolve(SRC, '../../api/gateway/src/modules/attendance/attendance.controller.ts'));
    const clockIn = ctl.slice(ctl.indexOf("@Post('clock-in')"), ctl.indexOf('async clockIn('));
    const clockOut = ctl.slice(ctl.indexOf("@Post('clock-out')"), ctl.indexOf('async clockOut('));
    expect(clockIn).toMatch(/@RequireAccessModule\('clock'\)/);
    expect(clockIn).toMatch(/@RequireModule\('time_tracking'\)/);
    // ⚠️ clock-out must never strand an open shift
    expect(clockOut).not.toMatch(/RequireAccessModule|RequireModule/);
  });
});
