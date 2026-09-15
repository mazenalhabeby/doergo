/**
 * Tapping a notification opens the screen it is about.
 *
 * Every push used to open Home: with the app closed the tap arrived before
 * anything listened, and a dozen types had no destination at all. These tests
 * pin both halves that can be checked without a phone — every type the server
 * sends has a row, and every row points at a screen that exists.
 */
import * as fs from 'fs';
import * as path from 'path';
import { NOTIFICATION_ROUTES, notificationTarget } from '../notification-route';

const MOBILE = path.resolve(__dirname, '../../..');
const NOTIFY = path.resolve(MOBILE, '../api/notification-service/src');
const viewer = { managesIssues: false };

function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__') yield* walk(full);
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) yield full;
  }
}

/** Every push `type` the notification service sends, as written in its source. */
function sentTypes(): Set<string> {
  const types = new Set<string>();
  for (const file of walk(NOTIFY)) {
    const src = fs.readFileSync(file, 'utf8');
    // Push data objects: `{ ... type: 'x' ... }` next to sendToUser, and the document helper's `'document_reviewed'` argument.
    for (const m of src.matchAll(/\btype:\s*'([a-z_.]+)'/g)) types.add(m[1]!);
    for (const m of src.matchAll(/this\.push\([^;]*?'(document_[a-z_]+|credential_[a-z_]+)'/gs)) types.add(m[1]!);
  }
  // Not push types: socket.io admin auth, and payload fields that happen to be called `type`.
  types.delete('basic');
  return types;
}

/** The app's screens as expo-router paths, groups included. */
function screens(): Set<string> {
  const out = new Set<string>();
  const appDir = path.join(MOBILE, 'app');
  const visit = (dir: string, prefix: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) visit(path.join(dir, e.name), `${prefix}/${e.name}`);
      else if (e.name.endsWith('.tsx') && !e.name.startsWith('_')) {
        const name = e.name.replace(/\.tsx$/, '');
        out.add(name === 'index' ? prefix || '/' : `${prefix}/${name}`);
      }
    }
  };
  visit(appDir, '');
  return out;
}

describe('notification routes', () => {
  it('has a row for every type the notification service sends', () => {
    const types = sentTypes();
    expect(types.size).toBeGreaterThan(20); // the scan found the service at all
    const missing = [...types].filter((t) => !(t in NOTIFICATION_ROUTES));
    expect(missing).toEqual([]);
  });

  it('points every row at a screen that exists', () => {
    const known = screens();
    const sample = { taskId: 't1', documentId: 'd1', conversationId: 'c1', ticketId: 's1', issueId: 'i1', customerId: 'k1', kind: 'decided' };
    for (const [type, resolve] of Object.entries(NOTIFICATION_ROUTES)) {
      for (const v of [{ managesIssues: false }, { managesIssues: true }]) {
        const target = resolve({ type, ...sample }, v);
        if (target) expect(`${type} → ${known.has(target.pathname) ? 'ok' : target.pathname}`).toBe(`${type} → ok`);
      }
    }
  });

  it('opens what the notification is about', () => {
    expect(notificationTarget({ type: 'document_awaiting_signature', documentId: 'd1' }, viewer)).toEqual({ pathname: '/(app)/documents', params: { open: 'd1' } });
    expect(notificationTarget({ type: 'shift_reminder', entryId: 'e1' }, viewer)).toEqual({ pathname: '/(app)/(tabs)/attendance' });
    expect(notificationTarget({ type: 'task_assigned', taskId: 't1' }, viewer)).toEqual({ pathname: '/(app)/task/[id]', params: { id: 't1' } });
    expect(notificationTarget({ type: 'chat', conversationId: 'c1' }, viewer)).toEqual({ pathname: '/(app)/chat', params: { conversationId: 'c1' } });
    expect(notificationTarget({ type: 'overtime.approved', overtimeRequestId: 'o1' }, viewer)).toEqual({ pathname: '/(app)/overtime/[id]', params: { id: 'o1' } });
    expect(notificationTarget({ type: 'crm_reminder', customerId: 'k1' }, viewer)).toEqual({ pathname: '/(app)/customer/[id]', params: { id: 'k1' } });
    expect(notificationTarget({ type: 'asset.expense_decided', assetId: 'a1', entryId: 'm1' }, viewer)).toEqual({ pathname: '/(app)/my-assets' });
    expect(notificationTarget({ type: 'asset.handed_over', assetId: 'a1', direction: 'to' }, viewer)).toEqual({ pathname: '/(app)/my-assets' });
  });

  it('sends a shift issue to whichever screen hosts the thread for this person', () => {
    expect(notificationTarget({ type: 'shift_issue', issueId: 'i1' }, { managesIssues: true })?.pathname).toBe('/(app)/(tabs)/manage');
    expect(notificationTarget({ type: 'shift_issue', issueId: 'i1' }, { managesIssues: false })?.pathname).toBe('/(app)/(tabs)/attendance');
  });

  it('stays put when there is nowhere better, and never invents a route', () => {
    expect(notificationTarget({ type: 'join_request_approved' }, viewer)).toBeNull();
    expect(notificationTarget({ type: 'asset_proposal', kind: 'raised' }, viewer)).toBeNull();
    // Confirming an expense is on the web; a phone has no queue to open.
    expect(notificationTarget({ type: 'asset.expense_submitted', assetId: 'a1', entryId: 'm1' }, { managesIssues: true })).toBeNull();
    expect(notificationTarget({ type: 'something_new' }, viewer)).toBeNull();
    expect(notificationTarget({ type: 'something_new', taskId: 't9' }, viewer)?.params).toEqual({ id: 't9' });
    expect(notificationTarget({ type: 'task_assigned' }, viewer)).toBeNull();
    expect(notificationTarget(undefined, viewer)).toBeNull();
    // A missing id is dropped, not sent as "undefined".
    expect(notificationTarget({ type: 'chat' }, viewer)).toEqual({ pathname: '/(app)/chat' });
  });
});
