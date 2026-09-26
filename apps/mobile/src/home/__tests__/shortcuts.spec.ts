import type { Destination } from '../../lib/manage-rows';
import { shortcutCandidates, smartPicks, shownShortcuts, waitingElsewhere, groupOf } from '../shortcuts';

const row = (labelKey: string, over: Partial<Destination> = {}): Destination => ({
  icon: 'x', labelKey, descKey: `${labelKey}Desc`, route: `/(app)/${labelKey}`, color: '#000', permission: '', orgWide: false, ...over,
});

const docs = row('documents', { home: true, badge: 'documents.due' });
const sync = row('sync', { home: true, badge: 'sync.queued' });
const newJob = row('newJob', { home: true, act: true });
const scan = row('scan', { home: true, act: true });
const send = row('send', { home: true, act: true });
const route = row('route', { home: true });
const members = row('members', { manage: true });
const ALL = [docs, sync, newJob, scan, send, route, members];

describe('the Shortcuts card', () => {
  it('never offers a route that opens a sheet', () => {
    expect(shortcutCandidates([...ALL, row('issues', { route: 'sheet:issues' })]).map((r) => r.labelKey)).not.toContain('issues');
  });

  it('smart picks: what is waiting (most first), then actions in table order, then places', () => {
    expect(smartPicks(ALL, { 'sync.queued': 12, 'documents.due': 2 })).toEqual(['sync', 'documents', 'newJob', 'scan']);
    expect(smartPicks(ALL, {})).toEqual(['newJob', 'scan', 'send', 'documents']);
  });

  it('never chosen: the smart picks, live', () => {
    expect(shownShortcuts(null, ALL, {}).map((r) => r.labelKey)).toEqual(['newJob', 'scan', 'send', 'documents']);
  });

  it('chosen: the member’s order is kept, whatever is waiting', () => {
    expect(shownShortcuts(['route', 'members', 'send'], ALL, { 'sync.queued': 5 }).map((r) => r.labelKey)).toEqual(['route', 'members', 'send']);
  });

  it('a chosen tile they can no longer open is refilled from the smart picks', () => {
    const allowed = ALL.filter((r) => r !== members);
    expect(shownShortcuts(['route', 'members', 'send'], allowed, {}).map((r) => r.labelKey)).toEqual(['route', 'send', 'newJob']);
  });

  it('says what is waiting behind a shortcut that is not on the card', () => {
    const shown = shownShortcuts(['newJob', 'scan'], ALL, { 'sync.queued': 4 });
    expect(waitingElsewhere(shown, ALL, { 'sync.queued': 4 })?.labelKey).toBe('sync');
    expect(waitingElsewhere(shown, ALL, {})).toBeNull();
  });

  it('groups the editor: waiting, do, go to, manage', () => {
    expect(groupOf(sync, { 'sync.queued': 1 })).toBe('waiting');
    expect(groupOf(sync, {})).toBe('go');
    expect(groupOf(newJob, {})).toBe('do');
    expect(groupOf(members, {})).toBe('manage');
  });
});
