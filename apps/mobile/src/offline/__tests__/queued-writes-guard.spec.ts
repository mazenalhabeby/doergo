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
import { SYNC_OPERATIONS } from '@hbcfield/shared/client';

const ROOT = path.resolve(__dirname, '../../..');
const API_DIR = path.join(ROOT, 'src/lib/api');
const SCANNED = ['app', 'src/components', 'src/hooks', 'src/screens', 'src/features'].map((d) => path.join(ROOT, d));

/*
  Two shapes are allowed, because a store binary without the offline layer
  (1.0.5 and older) must still reach the server:

  1. The online fallback handed to a queue helper — `queued.run(input, () => api.fn(...))`.
     Recognised here without a list: the helper decides, not the screen.
  2. The `else` of `if (offline.engine)`. Those are COUNTED per file below. A
     new direct call in a listed file raises the count and fails, which is the
     point: it has to be read to know whether it sits behind the engine check.
*/
const FALLBACK = 'the no-offline-build path, behind `if (offline.engine)`';
const ENGINE_FALLBACKS: Record<string, { calls: Record<string, number>; why: string }> = {
  /*
    The job page split into `src/components/job/` when it was rebuilt to
    `docs/design/job-flow.html`. The status write stayed on the screen (one
    call, every step, Blocked and Cancel included — it was three); every other
    fallback moved with the code into the writes hook.
  */
  'app/(app)/task/[id].tsx': {
    calls: { 'tasksApi.updateStatus': 1 },
    why: FALLBACK,
  },
  // A crew on one job (offline/tasks/crew-actions.ts): the lead hand-over's direct path.
  'src/components/job/use-crew.ts': {
    calls: { 'tasksApi.changeLead': 1 },
    why: FALLBACK,
  },
  'src/components/job/use-job-writes.ts': {
    calls: {
      'tasksApi.addComment': 1,
      'tasksApi.declineTask': 1,
      // Paused at a clock-out: picking it back up, and the handover note.
      'tasksApi.resumeWork': 1,
      'tasksApi.writeHandover': 1,
      /*
        ONE uploader (`sendFile`) for a photo added to the job and for a step
        form's photos and signatures. The old finish path (`reportsApi.completeTask`
        + report photos) is gone: a step's report is its form, answered on the
        status change itself.
      */
      'taskAttachmentsApi.confirmUpload': 1,
    },
    why: FALLBACK,
  },
  /*
    New job was rebuilt to `docs/design/job-flow.html`; the route is thin now
    and the send moved with the code into its hook — the same two calls.
  */
  'src/components/new-job/use-create-job.ts': {
    calls: { 'tasksApi.create': 1, 'taskAttachmentsApi.confirmUpload': 1 },
    why: FALLBACK,
  },
  /*
    TWO calls, and the second is NOT a no-offline-build fallback.

    `submitPages` files sheets of paper as one document, and it names staging
    keys that only exist because each sheet was already PUT to the object
    store. There is nothing to queue: a queued submit citing keys whose uploads
    never happened would fail on arrival, having told the member it was sent.
    So it refuses while offline and says so, which is the honest answer for a
    flow that cannot work without a connection.
  */
  'src/components/supply-document-sheet.tsx': {
    calls: { 'documentsApi.submitOwn': 2 },
    why: `${FALLBACK}, plus multi-sheet submit which cannot be queued — its pages must reach the store first`,
  },
  /*
    The issue sheets split into one file each when they were rebuilt to
    `shift-clock.md` §4–§7; `shift-issue-sheet.tsx` is now the door they came
    through and calls nothing itself. The allowance moved with the code — the
    same two direct calls, in the two files that now make them.
  */
  'src/components/issues/report-issue-sheet.tsx': {
    calls: { 'shiftIssuesApi.create': 1, 'shiftIssuesApi.message': 1 },
    why: `${FALLBACK}. The photo message is posted AFTER create, because the S3 key is namespaced by the issue id`,
  },
  'src/components/issues/issue-thread-sheet.tsx': { calls: { 'shiftIssuesApi.message': 1 }, why: FALLBACK },
  'app/(app)/asset-expense.tsx': { calls: { 'assetsApi.submitExpense': 1 }, why: FALLBACK },
  'app/(app)/asset-log.tsx': { calls: { 'assetsApi.createLog': 1 }, why: FALLBACK },
  'app/(app)/send-document.tsx': { calls: { 'assetProposalsApi.raise': 1 }, why: FALLBACK },
  // One copy of a member's leave, shared by the Time off tab and the Time tab.
  'src/components/time/use-my-time-off.ts': { calls: { 'timeOffApi.cancel': 1 }, why: FALLBACK },
  'src/components/profile/profile-screen.tsx': { calls: { 'userApi.setPresence': 1 }, why: FALLBACK },
  // Time format and language: both pages live in one file now.
  'src/components/settings/choice-pages.tsx': { calls: { 'userApi.setTimeFormat': 1, 'userApi.setLocale': 1 }, why: FALLBACK },
  // The client portal runs no offline layer: a client edits their name at home, not in a basement.
  'app/(customer)/edit-profile.tsx': { calls: { 'userApi.updateProfile': 1 }, why: 'the customer portal has no outbox' },
  // Same portal: its sync push is confined to portal requests, so a language change goes direct.
  'app/(customer)/(tabs)/profile.tsx': { calls: { 'userApi.setLocale': 1 }, why: 'the customer portal has no outbox for profile changes' },
  // The work log's data moved out of the sheet so the Today card reads the same notes.
  'src/components/worklog/use-worklog.ts': {
    calls: { 'worklogApi.addNote': 1, 'worklogApi.confirmAttachment': 1 },
    why: 'directSave: the legacy path for a build without the offline layer',
  },
};

const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** `/tasks/:taskId/comments` and `/tasks/${id}/comments` → `/tasks/:/comments`. */
const shape = (p: string) => p.split('?')[0]!.replace(/\$\{[^}]+\}/g, ':').replace(/:[A-Za-z]+/g, ':');

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
        for (const call of fn.matchAll(/fetchWithAuth(?:<[^(]*>)?\(\s*[`'"]([^`'"]+)[`'"]\s*,\s*\{[^}]*?method:\s*'(\w+)'/g)) {
          if (queued.has(`${call[2]} ${shape(call[1]!)}`)) found.add(`${obj[1]}.${m[1]}`);
        }
      });
    }
  }
  return found;
}

const callsTo = (src: string, fn: string) => (src.match(new RegExp(`\\b${fn.replace('.', '\\s*\\.\\s*')}\\s*\\(`, 'g')) ?? []).length;

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
    expect([...functions]).toEqual(expect.arrayContaining([
      'tasksApi.addComment', 'tasksApi.updateStatus',
      // The CRM writes: a PATCH on the record, both ends of a contact link, and
      // a reminder's tick. Named here because each reaches its route through a
      // differently-shaped function, and one of them silently dropping out of
      // the scan would let a direct call back onto the record screen.
      'customersApi.update', 'customersApi.addContact', 'customersApi.updateContact',
      'customersApi.removeContact', 'customersApi.updateActivity',
    ]));
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
