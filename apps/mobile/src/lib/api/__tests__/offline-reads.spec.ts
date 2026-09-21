/**
 * Every screen's reads must survive no signal — by ONE of three routes.
 *
 * Nothing in the app declares which. A new GET simply falls through to the
 * network and works perfectly on the office Wi-Fi, and the first person to
 * find out is a member in a basement looking at an error. This test reads the
 * API layer, works out which route each GET has, and fails on one that has
 * none — so a new endpoint has to be thought about once, here.
 *
 * The three routes:
 *   1. the response cache's allow-list (response-cache.ts) — most reads;
 *   2. its own richer reader under src/offline — the phone's rows with unsent
 *      changes on top (tasks, the shift, the worklog);
 *   3. named below as something that genuinely cannot work offline.
 */
import * as fs from 'fs';
import * as path from 'path';
import { isKeptResponse } from '../response-cache';

const DIR = path.resolve(__dirname, '..');
const SKIP = ['client.ts', 'response-cache.ts', 'network-error.ts', 'types.ts', 'index.ts'];

/** Comments quote endpoints constantly — this file included. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * Reads answered by a dedicated offline reader instead of a kept response.
 * Deliberately NOT in the allow-list: a kept answer would reply first, older,
 * and pretend to be fresh — see the NEVER list in response-cache.ts.
 */
const OWN_READER: Record<string, string> = {
  '/tasks/:x': 'src/offline/tasks/task-source.ts (loadTaskDetail)',
  '/tasks/:x/comments': 'src/offline/tasks/task-source.ts (loadTaskDetail)',
  '/tasks/:x/attachments': 'src/offline/tasks/task-source.ts (loadTaskDetail)',
  '/attendance/status': 'src/offline/attendance/use-shift.ts (loadShift)',
  '/attendance/breaks/status': 'src/offline/attendance/use-shift.ts (loadShift)',
  '/attendance/entries/:x/worklog': 'src/offline/attendance/worklog.ts',
  '/tasks': 'src/offline/tasks/use-home-tasks.ts + the Tasks tab (filterTasksLocally)',
};

/** Reads that cannot mean anything without a server, with the reason. */
const ONLINE_ONLY: Record<string, string> = {
  '/auth/me': 'reconciliation only — the signed-in member is restored from SecureStore, and the failure is swallowed',
  '/onboarding/status': 'joining an organization is not something that happens in a basement',
  '/onboarding/validate-org-code/:x': 'the server is the only thing that knows whether a code is real',
  '/billing/subscription': "Stripe's own status; a kept copy would be a stale claim about money",
};

/*
  `${taskId}` -> :x. A trailing `${qs}` is a query string and is dropped — but
  only when it does NOT follow a slash, or `/tasks/${id}` (a real path segment)
  would collapse onto `/tasks` and inherit the list's exemption.
*/
const norm = (raw: string) =>
  raw.replace(/([^/])\$\{[^}]*\}$/, '$1').replace(/\$\{[^}]*\}/g, ':x').split('?')[0].replace(/\/$/, '');

function endpoints(): { file: string; ep: string }[] {
  const out: { file: string; ep: string }[] = [];
  for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.ts') && !SKIP.includes(f))) {
    const s = strip(fs.readFileSync(path.join(DIR, f), 'utf8'));
    /*
      Half this layer does not hand `fetchWithAuth` a literal — it builds
      `const endpoint = buildUrlWithQuery('/employees', params)` first. Reading
      only the call sites skipped those silently, which is how `/employees` (the
      whole Team tab) sat uncached without anything noticing. Collect the
      literal wherever the endpoint is actually written.
    */
    for (const m of s.matchAll(/(?:buildUrlWithQuery\(|const\s+(?:url|endpoint)\s*(?::[^=]*)?=)\s*[`'"](\/[^`'"]*)[`'"]/g)) {
      out.push({ file: f, ep: norm(m[1]) });
    }
    /*
      ⚠️ The options are read through a LOOKAHEAD. Consuming them ate the next
      140 characters, so any call written close to the one before it vanished
      from the scan — and a guard that quietly sees less than it claims is
      worse than none. Proved by planting a call right after another.
    */
    for (const m of s.matchAll(/fetchWithAuth(?:<[^>]*>)?\(\s*[`'"]([^`'"]+)[`'"]\s*([,)])(?=([\s\S]{0,140}))/g)) {
      const [, raw, sep, tail] = m;
      if (sep === ',' && /method:\s*'(POST|PATCH|PUT|DELETE)'/.test(tail)) continue;
      out.push({ file: f, ep: norm(raw) });
    }
  }
  const seen = new Set<string>();
  return out.filter((r) => !seen.has(r.ep) && seen.add(r.ep));
}

describe('every read survives no signal', () => {
  const all = endpoints();

  it('finds the API layer (a rename that silently matched nothing would pass everything)', () => {
    expect(all.length).toBeGreaterThan(30);
  });

  it.each(all)('$ep ($file)', ({ ep }) => {
    const route = isKeptResponse(ep) || OWN_READER[ep] || ONLINE_ONLY[ep];
    if (route) return expect(route).toBeTruthy();
    throw new Error(
      `GET ${ep} has no offline route.\n` +
        `Add it to KEEP in response-cache.ts if its answer is the member's own data and safe to hold,\n` +
        `or to OWN_READER / ONLINE_ONLY in this file with the reason.`,
    );
  });

  it('lists nothing that has since been cached or deleted', () => {
    const live = new Set(all.map((r) => r.ep));
    for (const ep of Object.keys(OWN_READER)) expect([ep, live.has(ep)]).toEqual([ep, true]);
    for (const ep of Object.keys(ONLINE_ONLY)) {
      expect([ep, live.has(ep)]).toEqual([ep, true]);
      // An exemption that the allow-list now covers is an exemption to delete.
      expect(isKeptResponse(ep)).toBe(false);
    }
  });
});
