import type { Destination } from '@/lib/manage-rows';
import { destinationsFor } from '@/lib/manage-rows';
import { badgeOf, groupOf, shortcutCandidates, shownShortcuts, smartPicks, MIN_TILES, SLOTS } from '../shortcuts';

/**
 * The member's own four, as they come back off the disk.
 *
 * `loadShortcuts` returns whatever an older app version wrote (it only checks
 * "array of strings", sliced to four). So the card's rule is the only thing
 * standing between a stale or odd list and a card that draws nothing — and a
 * card that draws nothing has no Edit button, so it can never be repaired.
 */
const row = (labelKey: string, over: Partial<Destination> = {}): Destination => ({
  icon: 'dot',
  labelKey,
  descKey: `${labelKey}Desc`,
  route: `/(app)/${labelKey}`,
  color: '#000',
  permission: '',
  orgWide: false,
  ...over,
});

const docs = row('documents', { home: true, badge: 'documents.due' });
const sign = row('sign', { home: true, badge: 'documents.toSign' });
const sync = row('sync', { home: true, badge: 'sync.queued' });
const newJob = row('newJob', { home: true, act: true });
const scan = row('scan', { home: true, act: true });
const send = row('send', { home: true, act: true });
const route = row('route', { home: true });
const members = row('members', { manage: true });
const support = row('support');
const ALL = [docs, sign, sync, newJob, scan, send, route, members, support];
const keys = (rs: Destination[]) => rs.map((r) => r.labelKey);

describe('Shortcuts widget — the chosen four', () => {
  it('keeps the member’s order, whatever is waiting or however the table is ordered', () => {
    const chosen = ['support', 'route', 'members', 'documents'];
    expect(keys(shownShortcuts(chosen, ALL, { 'sync.queued': 40 }))).toEqual(chosen);
    expect(keys(shownShortcuts(chosen, [...ALL].reverse(), {}))).toEqual(chosen);
  });

  it('a lost tile is dropped and its slot refilled from the smart picks, keeping the rest in place', () => {
    const allowed = ALL.filter((r) => r !== members);
    expect(keys(shownShortcuts(['route', 'members', 'send', 'support'], allowed, {}))).toEqual([
      'route',
      'send',
      'support',
      'newJob',
    ]);
  });

  it('the refill prefers what is waiting', () => {
    const allowed = ALL.filter((r) => r !== members);
    expect(keys(shownShortcuts(['route', 'members'], allowed, { 'documents.toSign': 3 }))).toEqual(['route', 'sign']);
  });

  it('duplicates on disk collapse to one tile (one React key, no wasted slot)', () => {
    const shown = keys(shownShortcuts(['route', 'route', 'send', 'route'], ALL, {}));
    expect(shown).toEqual(['route', 'send']);
    expect(new Set(shown).size).toBe(shown.length);
  });

  it('never more than four, even from a longer list', () => {
    expect(keys(shownShortcuts(['support', 'route', 'members', 'send', 'newJob', 'scan'], ALL, {}))).toEqual([
      'support',
      'route',
      'members',
      'send',
    ]);
  });

  it('stale keys from an older app version are ignored and refilled, never shown', () => {
    const shown = keys(shownShortcuts(['shortcuts.messages', 'route', 'shortcuts.chat'], ALL, {}));
    expect(shown).toEqual(['route', 'newJob', 'scan']);
  });

  it('an EMPTY stored list is "never chosen", not "show nothing"', () => {
    expect(keys(shownShortcuts([], ALL, {}))).toEqual(smartPicks(ALL, {}));
  });

  it('a one-key list is topped up to two, so the card (and its Edit button) still draws', () => {
    expect(shownShortcuts(['route'], ALL, {}).length).toBe(MIN_TILES);
    // …and when the one key is gone too.
    expect(shownShortcuts(['gone'], ALL, {}).length).toBe(MIN_TILES);
  });

  it('refills beyond the smart picks when they run short', () => {
    // Only non-home rows survive: no smart picks at all, yet two are still openable.
    const onlyManage = [members, support];
    expect(smartPicks(onlyManage, {})).toEqual([]);
    expect(keys(shownShortcuts(['gone', 'alsoGone'], onlyManage, {}))).toEqual(['members', 'support']);
  });

  it('with fewer candidates than MIN_TILES the card has nothing to draw', () => {
    expect(shownShortcuts(['route'], [route], {}).length).toBe(1); // the card returns null below MIN_TILES
  });

  it('every tile shown is a candidate — nothing outside the member’s table ever appears', () => {
    const allowed = [docs, route, send];
    for (const chosen of [null, [], ['members', 'support'], ['route', 'x', 'y', 'z'], ['send', 'send']]) {
      for (const r of shownShortcuts(chosen as string[] | null, allowed, {})) expect(allowed).toContain(r);
    }
  });

  it('smart picks: order is stable across renders with the same counts', () => {
    const a = smartPicks(ALL, { 'documents.due': 2, 'sync.queued': 2 });
    const b = smartPicks(ALL, { 'documents.due': 2, 'sync.queued': 2 });
    expect(a).toEqual(b);
    expect(a).toEqual(['documents', 'sync', 'newJob', 'scan']); // a tie keeps table order
  });

  it('badges come from data only: no count, no badge; a row with no badge source never shows one', () => {
    expect(badgeOf(docs, {})).toBe(0);
    expect(badgeOf(docs, { 'documents.due': 4 })).toBe(4);
    expect(badgeOf(route, { 'documents.due': 4 } as never)).toBe(0);
    expect(groupOf(docs, { 'documents.due': 0 })).toBe('go');
  });

  it('a sheet route is never a candidate, and each label appears once', () => {
    const c = shortcutCandidates([...ALL, row('issues', { route: 'sheet:issues' }), row('route', { home: true })]);
    expect(keys(c)).not.toContain('issues');
    expect(keys(c).filter((k) => k === 'route')).toHaveLength(1);
  });

  it('losing access on a REAL session: an admin demoted to a plain member loses Members and the slot refills', () => {
    const admin = {
      id: 'u',
      role: 'ADMIN',
      access: { org: {} },
      spaceModules: ['crm', 'assets'],
      orgAddOns: [],
      offlineMode: true,
    };
    const member = {
      id: 'u',
      role: 'EMPLOYEE',
      access: { org: {} },
      spaceModules: ['crm', 'assets'],
      orgAddOns: [],
      offlineMode: true,
      enabledModules: { modules: ['tasks'] },
    };
    const chosen = ['manage.members.label', 'shortcuts.sync', 'shortcuts.support'];
    expect(keys(shownShortcuts(chosen, shortcutCandidates(destinationsFor(admin as never)), {}))).toEqual(chosen);
    const after = keys(shownShortcuts(chosen, shortcutCandidates(destinationsFor(member as never)), {}));
    expect(after).not.toContain('manage.members.label');
    expect(after.slice(0, 2)).toEqual(['shortcuts.sync', 'shortcuts.support']);
    expect(after).toHaveLength(3);
  });

  it('SLOTS is four and MIN_TILES two (the spec, and the card’s layout, assume it)', () => {
    expect([SLOTS, MIN_TILES]).toEqual([4, 2]);
  });
});
