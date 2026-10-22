/**
 * More is a page, and it offers exactly what the bar leaves out.
 */
import * as fs from 'fs';
import * as path from 'path';
import { splitTabs, tabAccessFor, tabVisible } from '../tab-layout';
import { groupManageRows } from '@/features/more/more-groups';
import { readSource } from '@/test-utils/read-source';

const SRC = path.resolve(__dirname, '../..');
const read = (p: string) => readSource(path.join(SRC, p), 'utf8');
const ROUTES = ['index', 'tasks', 'create-task', 'manage', 'attendance', 'time-off', 'team', 'chat', 'calendar', 'profile', 'more'];

describe('who gets which tab — one answer', () => {
  const all = { isAdmin: false, tasks: true, attendance: true, timeOff: true, create: true, team: true, chat: true, calendar: true };

  it('profile, manage and more are never slots', () => {
    for (const n of ['profile', 'manage', 'more']) expect(tabVisible(n, { ...all, isAdmin: true })).toBe(false);
  });

  it('an admin has no Time off tab; chat is never a slot (Team → Messages holds it)', () => {
    expect(tabVisible('time-off', { ...all, isAdmin: true })).toBe(false);
    expect(tabVisible('chat', { ...all, isAdmin: true, chat: true })).toBe(false);
  });

  it('chat no longer needs the paid Live Chat option — Messaging decides', () => {
    expect(tabAccessFor({ role: 'EMPLOYEE', orgAddOns: [] } as never).chat).toBe(true);
    expect(tabAccessFor({ role: 'EMPLOYEE', enabledModules: { canContact: false } } as never).chat).toBe(false);
  });

  it('what the bar leaves out is what More offers — four on the bar, the rest overflow', () => {
    const visible = ROUTES.filter((n) => tabVisible(n, all)).map((name) => ({ name }));
    const { barRoutes, overflowRoutes } = splitTabs(visible, true);
    expect(barRoutes.map((r) => r.name)).toEqual(['index', 'tasks', 'attendance', 'team']);
    expect(overflowRoutes.map((r) => r.name)).toEqual(['calendar', 'time-off', 'create-task']);
  });

  it('a member with nothing reads nothing', () => {
    const a = tabAccessFor({ role: 'EMPLOYEE' } as never);
    expect(a.isAdmin).toBe(false);
    expect(tabVisible('chat', a)).toBe(false);
  });

  it('the calendar is everybody\'s except an external member\'s', () => {
    expect(tabVisible('calendar', tabAccessFor({ role: 'EMPLOYEE' } as never))).toBe(true);
    expect(tabVisible('calendar', tabAccessFor({ role: 'EMPLOYEE', isExternal: true } as never))).toBe(false);
  });
});

describe('the Manage doors, grouped', () => {
  const row = (route: string) => ({ route, labelKey: route, descKey: route }) as never;
  it('by what they are for, in a fixed order; an unfiled door lands in Work, never nowhere', () => {
    const g = groupManageRows([row('/(app)/manage/members'), row('/(app)/manage/time-off-requests'), row('/(app)/new-thing'), row('sheet:issues')]);
    expect(g.map((x) => [x.key, x.rows.length])).toEqual([['time', 2], ['people', 1], ['work', 1]]);
  });
  it('no empty groups', () => {
    expect(groupManageRows([row('/(app)/manage/time-off-requests')]).map((x) => x.key)).toEqual(['time']);
  });
});

describe('More is a page, not a popup', () => {
  const layout = read('../app/(app)/(tabs)/_layout.tsx');
  it('the ••• navigates to the page, and the bar holds no sheet', () => {
    expect(layout).toMatch(/onPress: \(\) => navigation\.navigate\('more'\)/);
    expect(layout).not.toMatch(/<BlurSheet|moreOpen/);
    expect(layout).toMatch(/name="more"[\s\S]{0,120}href: null/);
  });
  it('the bar and the page ask the same function', () => {
    expect(layout).toMatch(/tabVisible\(route\.name, access\)/);
    expect(read('features/more/more-screen.tsx')).toMatch(/tabVisible\(n, access\)/);
  });
  it('the page uses the shared ground and header', () => {
    const src = read('features/more/more-screen.tsx');
    expect(src).toMatch(/<Ground/);
    expect(src).toMatch(/<ScreenHeader/);
  });
});
