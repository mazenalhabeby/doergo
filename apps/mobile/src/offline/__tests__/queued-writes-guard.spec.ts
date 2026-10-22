/**
 * A write the phone can queue must be MADE through the queue.
 *
 * Every route in SYNC_OPERATIONS has an offline path: an id made on the phone,
 * an outbox entry, a replay that answers a resend. A screen that calls the
 * plain API function for one of those routes gets none of it — the tap is lost
 * in a basement, and a retry after a dropped answer does it twice. It also
 * type-checks and works perfectly on the office Wi-Fi, which is why a test has
 * to say it.
 *
 * The test reads the API modules to learn which functions reach a queued route
 * (so a new function on an old route is covered without editing this file),
 * then reads every screen, component and hook for calls to them.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SYNC_OPERATIONS, apiEndpoints } from '@hbcfield/shared/client';

const ROOT = path.resolve(__dirname, '../../..');
const API_DIR = path.join(ROOT, 'src/lib/api');
const SCANNED = ['app', 'src/components', 'src/hooks', 'src/screens', 'src/features'].map((d) => path.join(ROOT, d));

/*
  Two shapes are allowed, because a store binary without the offline layer
  (1.0.5 and older) must still reach the server:

  1. The online fallback handed to a queue helper — `queued.run(input, () => api.fn(...))`.
     Recognised here without a list: the helper decides, not the screen.
  2. Anything else. Those are COUNTED per file below. A new direct call in a
     listed file raises the count and fails, which is the point: it has to be
     read to know whether it is a fallback or a write that skips the queue.

  Every write to a queued route is ONE code path through `useQueuedWrite().run`
  (or `useQueuedCreate`), which picks the outbox or the API by itself. What is
  left here is either not a queue-helper shape at all (chat photos, sheets of
  paper, the customer portal) or a fallback the scan cannot see: a direct path
  that uploads the file first (presign → PUT → the counted call) is more than
  one call, so it is a block handed to `run`, not the `() => api.fn(...)` the
  regex below recognises. Those are read by a person, and counted.
*/
const UPLOAD_FIRST =
  'the fallback handed to `write.run` — it uploads the file first (presign → PUT), so it is a block the scan cannot recognise';
const ENGINE_FALLBACKS: Record<string, { calls: Record<string, number>; why: string }> = {
  /*
    A chat message WITH PHOTOS is sent directly: the photos are uploaded first,
    which needs the network anyway, so there is nothing to queue. Words alone
    go through the queue in the same hook.
  */
  'src/features/chat/use-chat-thread.ts': {
    calls: { 'chatApi.send': 2 },
    why: "a message with photos needs the network (uploaded first); the second call is the queue's own online fallback for words",
  },
  /*
    ONE uploader (`sendFile`) for a photo added to the job and for a step
    form's photos and signatures; its direct path is `uploadDirect`.
  */
  'src/features/job/use-job-writes-data.ts': { calls: { 'taskAttachmentsApi.confirmUpload': 1 }, why: UPLOAD_FIRST },
  // New job: the task goes through `write.run`; each photo too, its direct path `uploadPhotoDirect`.
  'src/features/new-job/use-create-job.ts': { calls: { 'taskAttachmentsApi.confirmUpload': 1 }, why: UPLOAD_FIRST },
  /*
    The supply sheet split into `src/features/supply-document/`; its two
    direct calls moved with the code, one per hook — the same two as before.

    The credential's is the fallback handed to `write.run` (it uploads the
    photo first unless it was staged). The paper one is NOT: `submitPages`
    files sheets of paper as one document, and it names staging keys that only
    exist because each sheet was already PUT to the object store. There is
    nothing to queue: a queued submit citing keys whose uploads never happened
    would fail on arrival, having told the member it was sent. So it refuses
    while offline and says so, which is the honest answer for a flow that
    cannot work without a connection.
  */
  'src/features/supply-document/use-credential-photo.ts': { calls: { 'documentsApi.submitOwn': 1 }, why: UPLOAD_FIRST },
  'src/features/supply-document/use-paper-pages.ts': {
    calls: { 'documentsApi.submitOwn': 1 },
    why: 'multi-sheet submit which cannot be queued — its pages must reach the store first',
  },
  /*
    The issue sheets: the report goes through `write.run`. Without the offline
    layer its photos follow as a message on the new issue — posted AFTER the
    create, because the S3 key is namespaced by the issue id. The thread's
    reply is the fallback handed to `write.run`, its photos uploaded first.
  */
  'src/features/issues/use-report-issue-sheet.ts': {
    calls: { 'shiftIssuesApi.message': 1 },
    why: 'the no-offline-build photos of a new issue: posted after the create, the S3 key is namespaced by the issue id',
  },
  'src/features/issues/use-shift-issue-thread-sheet.ts': { calls: { 'shiftIssuesApi.message': 1 }, why: UPLOAD_FIRST },
  'src/features/equipment/use-asset-expense-screen.ts': { calls: { 'assetsApi.submitExpense': 1 }, why: UPLOAD_FIRST },
  'src/features/equipment/use-asset-log-screen.ts': { calls: { 'assetsApi.createLog': 1 }, why: UPLOAD_FIRST },
  'src/features/documents/use-send-document-screen.ts': { calls: { 'assetProposalsApi.raise': 1 }, why: UPLOAD_FIRST },
  // The client portal runs no offline layer: a client edits their name at home, not in a basement.
  'app/(customer)/edit-profile.tsx': {
    calls: { 'userApi.updateProfile': 1 },
    why: 'the customer portal has no outbox',
  },
  // Same portal: its sync push is confined to portal requests, so a language change goes direct.
  // (The profile screen's logic moved to its hook in the 2026-10-17 line-length split.)
  'src/features/customer/screens/tabs/use-customer-profile.ts': {
    calls: { 'userApi.setLocale': 1 },
    why: 'the customer portal has no outbox for profile changes',
  },
  // The work log's legacy queue (`legacyAdd`) is the fallback handed to `write.run`: a note, then its photos.
  'src/features/worklog/use-worklog.ts': {
    calls: { 'worklogApi.addNote': 1, 'worklogApi.confirmAttachment': 1 },
    why: 'legacyAdd: the fallback handed to `write.run` — the old queue for a build without the offline layer',
  },
};

const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** `/tasks/:taskId/comments` → `/tasks/:/comments`. */
const shape = (p: string) =>
  p
    .split('?')[0]!
    .replace(/\$\{[^}]+\}/g, ':')
    .replace(/:[A-Za-z]+/g, ':');

type EndpointDef = { method: string; path: (a: unknown) => string };
const PLACEHOLDER = 'XPLACEHOLDERX';
const placeholderArgs = new Proxy({}, { get: (_t, k) => (k === 'then' ? undefined : PLACEHOLDER) });
/** An endpoint's path with every argument a placeholder, in the same `:` shape. */
const builtShape = (def: EndpointDef) =>
  def
    .path(placeholderArgs)
    .split('?')[0]!
    .split('/')
    .map((seg) => (seg === PLACEHOLDER ? ':' : seg))
    .join('/');

function queuedApiFunctions(): Set<string> {
  const queued = new Set(Object.values(SYNC_OPERATIONS).map((r) => `${r.method} ${shape(r.path)}`));
  const found = new Set<string>();
  for (const file of fs.readdirSync(API_DIR).filter((f) => f.endsWith('.ts'))) {
    const src = stripComments(fs.readFileSync(path.join(API_DIR, file), 'utf8'));
    for (const obj of src.matchAll(/export const (\w+)\s*=\s*\{/g)) {
      const start = obj.index! + obj[0].length;
      // The object's body: up to the matching brace.
      let depth = 1;
      let i = start;
      while (i < src.length && depth > 0) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') depth--;
        i++;
      }
      const body = src.slice(start, i);
      const members = [...body.matchAll(/^\s+(\w+)\s*:\s*(?:async\s*)?\(/gm)];
      members.forEach((m, k) => {
        const end = members[k + 1]?.index ?? body.length;
        const fn = body.slice(m.index!, end);
        // Each request names its endpoint (`call(E.tasks.addComment, …)`); its method and path come from the table.
        for (const ref of fn.matchAll(/\bE\.(\w+)\.(\w+)\b/g)) {
          const def = (apiEndpoints as unknown as Record<string, Record<string, EndpointDef> | undefined>)[ref[1]!]?.[
            ref[2]!
          ];
          if (!def || def.method === 'GET') continue;
          if (queued.has(`${def.method} ${builtShape(def)}`)) found.add(`${obj[1]}.${m[1]}`);
        }
      });
    }
  }
  return found;
}

const callsTo = (src: string, fn: string) =>
  (src.match(new RegExp(`\\b${fn.replace('.', '\\s*\\.\\s*')}\\s*\\(`, 'g')) ?? []).length;

function* walk(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      yield* walk(full);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.(spec|test)\./.test(entry.name)) {
      yield full;
    }
  }
}

describe('queued writes go through the queue', () => {
  const functions = queuedApiFunctions();

  it('finds the API functions for queued routes (the scan itself works)', () => {
    // If these stop being found, the parser broke and the guard below passes vacuously.
    expect([...functions]).toEqual(
      expect.arrayContaining([
        'tasksApi.addComment',
        'tasksApi.updateStatus',
        // The CRM writes: a PATCH on the record, both ends of a contact link, and
        // a reminder's tick. Named here because each reaches its route through a
        // differently-shaped function, and one of them silently dropping out of
        // the scan would let a direct call back onto the record screen.
        'customersApi.update',
        'customersApi.addContact',
        'customersApi.updateContact',
        'customersApi.removeContact',
        'customersApi.updateActivity',
      ]),
    );
  });

  it('no screen, component or hook calls one directly', () => {
    const offenders: string[] = [];
    for (const dir of SCANNED) {
      for (const file of walk(dir)) {
        const src = stripComments(fs.readFileSync(file, 'utf8'));
        const rel = path.relative(ROOT, file);
        // Shape 1: a fallback lambda passed to `.run(...)` is the helper's business.
        const withoutRunFallbacks = src.replace(/\.run\(([^;]|;(?!\s*$))*?,\s*\(\)\s*=>\s*\w+\s*\.\s*\w+\(/gm, '.run(');
        for (const fn of functions) {
          const n = callsTo(withoutRunFallbacks, fn);
          if (n === 0) continue;
          const allowed = ENGINE_FALLBACKS[rel]?.calls[fn] ?? 0;
          if (n > allowed) offenders.push(`${rel} → ${fn} ×${n} (allowed ${allowed})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every counted fallback still exists at its count (no stale allowances)', () => {
    for (const [rel, { calls }] of Object.entries(ENGINE_FALLBACKS)) {
      const src = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
      for (const [fn, count] of Object.entries(calls)) {
        expect(`${rel} ${fn} ×${callsTo(src, fn)}`).toBe(`${rel} ${fn} ×${count}`);
        expect(functions.has(fn)).toBe(true);
      }
    }
  });
});
