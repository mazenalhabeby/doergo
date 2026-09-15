/**
 * The email switches, and the answer the "shift closed" email links to.
 *
 * Both screens are thin: what matters is that every word they ask for exists
 * in all five languages, and that the organization's switches are the keys the
 * SENDER reads — the old screen saved `emailOnTaskCreate`, a key no email has
 * ever consulted.
 */
import fs from 'fs';
import path from 'path';
import { ORG_EMAIL_SWITCH, MEMBER_EMAIL_PREF } from '@hbcfield/shared/client';

const LOCALES = ['en', 'de', 'es', 'fr', 'it'] as const;
const SRC = path.join(process.cwd(), 'src');

const load = (l: string) => JSON.parse(fs.readFileSync(path.join(SRC, `i18n/locales/${l}.json`), 'utf8'));
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const at = (obj: any, dotted: string): unknown => dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

const SETTINGS = 'app/(dashboard)/settings/page.tsx';
const CARD = 'components/attendance/unconfirmed-clock-out-card.tsx';

/** Literal keys under the given prefixes that a file passes to t(). */
function keysUsed(code: string, prefixes: string[]): string[] {
  return [...code.matchAll(/\bt\(\s*"([\w.]+)"/g)]
    .map((m) => m[1])
    .filter((k) => prefixes.some((p) => k.startsWith(p)));
}

describe('email settings and the unconfirmed clock-out card', () => {
  const used = [
    ...keysUsed(read(SETTINGS), ['settings.notifications.', 'settings.myEmails.', 'settings.nav.myEmails']),
    ...keysUsed(read(CARD), ['attendance.my.unconfirmed.']),
  ];

  it('finds the keys it is meant to check', () => {
    expect(used.length).toBeGreaterThan(20);
    expect(used).toEqual(expect.arrayContaining(['settings.myEmails.offByOrg', 'attendance.my.unconfirmed.keep']));
  });

  it.each(LOCALES)('every key exists in %s', (locale) => {
    const d = load(locale);
    expect(used.filter((k) => typeof at(d, k) !== 'string' || !(at(d, k) as string).trim())).toEqual([]);
  });

  it('the organization switches are the keys the sender reads, and the dead one is gone', () => {
    const code = read(SETTINGS);
    expect(code).toContain('ORG_EMAIL_SWITCH.taskAssigned');
    expect(code).toContain('ORG_EMAIL_SWITCH.taskCompleted');
    expect(code).toContain('ORG_EMAIL_SWITCH.autoClockOut');
    expect(code).toContain('MEMBER_EMAIL_PREF[kind]');
    expect(code).not.toContain('emailOnTaskCreate');
    // The constants really are what the server stores.
    expect(Object.values(ORG_EMAIL_SWITCH)).toEqual(['emailOnTaskAssigned', 'emailOnTaskComplete', 'emailOnAutoClockOut']);
    expect(Object.values(MEMBER_EMAIL_PREF)).toEqual(['emailTaskAssigned', 'emailTaskCompleted', 'emailAutoClockOut']);
  });

  it('the /my/attendance page renders the card the email links to', () => {
    expect(read('app/(dashboard)/my/attendance/page.tsx')).toContain('<UnconfirmedClockOutCard');
    expect(read(CARD)).toContain('get("confirm")');
  });

  it.each(LOCALES)('no longer names an automatic clock-out in the bell (%s)', (locale) => {
    expect(load(locale).notifications?.autoClockOut).toBeUndefined();
    expect(read('components/notification-bell.tsx')).not.toContain('attendance_auto_clock_out');
  });
});
