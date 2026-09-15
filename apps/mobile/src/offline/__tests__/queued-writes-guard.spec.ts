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
  'app/(app)/task/[id].tsx': {
    calls: {
      'tasksApi.addComment': 2,
      'tasksApi.updateStatus': 3,
      'tasksApi.declineTask': 1,
      'reportsApi.completeTask': 1,
      // The photo uploaders are only reached from the completeTask/attach fallbacks.
      'reportAttachmentsApi.confirmUpload': 1,
      'taskAttachmentsApi.confirmUpload': 1,
    },
    why: FALLBACK,
  },
  'app/(app)/(tabs)/create-task.tsx': {
    calls: { 'tasksApi.create': 1, 'taskAttachmentsApi.confirmUpload': 1 },
    why: FALLBACK,
  },
  'src/components/supply-document-sheet.tsx': { calls: { 'documentsApi.submitOwn': 1 }, why: FALLBACK },
  'src/components/shift-issue-sheet.tsx': { calls: { 'shiftIssuesApi.create': 1, 'shiftIssuesApi.message': 2 }, why: FALLBACK },
  'app/(app)/asset-expense.tsx': { calls: { 'assetsApi.submitExpense': 1 }, why: FALLBACK },
  'app/(app)/asset-log.tsx': { calls: { 'assetsApi.createLog': 1 }, why: FALLBACK },
  'app/(app)/send-document.tsx': { calls: { 'assetProposalsApi.raise': 1 }, why: FALLBACK },
  'app/(app)/(tabs)/time-off.tsx': { calls: { 'timeOffApi.cancel': 1 }, why: FALLBACK },
  'app/(app)/(tabs)/profile.tsx': { calls: { 'userApi.setPresence': 1 }, why: FALLBACK },
  'app/(app)/profile/time-format.tsx': { calls: { 'userApi.setTimeFormat': 1 }, why: FALLBACK },
  'app/(app)/profile/language.tsx': { calls: { 'userApi.setLocale': 1 }, why: FALLBACK },
  // The client portal runs no offline layer: a client edits their name at home, not in a basement.
  'app/(customer)/edit-profile.tsx': { calls: { 'userApi.updateProfile': 1 }, why: 'the customer portal has no outbox' },
  // Same portal: its sync push is confined to portal requests, so a language change goes direct.
  'app/(customer)/(tabs)/profile.tsx': { calls: { 'userApi.setLocale': 1 }, why: 'the customer portal has no outbox for profile changes' },
  'src/components/worklog-sheet.tsx': {
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
    expect([...functions]).toEqual(expect.arrayContaining(['tasksApi.addComment', 'tasksApi.updateStatus']));
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
