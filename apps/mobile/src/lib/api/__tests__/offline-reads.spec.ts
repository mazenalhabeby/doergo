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
 *   1. the response cache — the endpoint's own `keep` verdict in the shared
 *      table (response-cache.ts adds only the phone's own exceptions);
 *   2. its own richer reader under src/offline — the phone's rows with unsent
 *      changes on top (tasks, the shift, the worklog);
 *   3. named below as something that genuinely cannot work offline.
 */
import * as fs from 'fs';
import * as path from 'path';
import { apiEndpoints } from '@hbcfield/shared/client';
import { shouldKeep } from '../response-cache';

const ROOT = path.resolve(__dirname, '../../../..');

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
  '/sync/pull': 'it IS the offline layer — pulled rows go into the records store (src/offline/db), never the response cache',
};

/** Reads that cannot mean anything without a server, with the reason. */
const ONLINE_ONLY: Record<string, string> = {
  '/calendar/people': 'the invite picker — inviting somebody is itself online, so a kept colleague list would only offer a send that cannot happen',
  '/auth/me': 'reconciliation only — the signed-in member is restored from SecureStore, and the failure is swallowed',
  '/onboarding/status': 'joining an organization is not something that happens in a basement',
  '/onboarding/validate-org-code/:x': 'the server is the only thing that knows whether a code is real',
  '/invitations/validate/:x': 'the same for an invitation code — and asked before there is a session at all',
  '/tasks/counts': "the scope badges count the organization's work on the server; a kept count is a number from another moment",
  // The address picker: a lookup of what is being typed, which only a geocoder can answer.
  '/geo/search': 'geocoding an address as it is typed — only a geocoder can answer it',
  '/geo/reverse': 'naming a dropped pin — the pin keeps its coordinates offline, only the label waits',
  '/geo/place': "a picked suggestion's coordinates — the suggestion itself needed the network",
  '/rota/week': 'other people’s staffing, for a rota manager: not the member’s own data to hold on a phone, and a stale week is a wrong one',
  '/organizations/roles': 'the org role catalogue, read only by an admin approving a join request — an approval is itself online, so there is nothing to do with a cached list',
  '/billing/subscription': "Stripe's own status; a kept copy would be a stale claim about money",
  '/tasks/open-for-me': 'jobs open to my role RIGHT NOW — the first to take each place gets it; a kept list would offer a job somebody else already took, so the section hides offline',
  // Presence — who is on RIGHT NOW. The Crew card says it needs a connection rather than show this morning.
  '/attendance/no-shows': 'presence: a kept answer would name somebody late who has since arrived',
  '/attendance/active-entries': 'presence: who is clocked in now',
  '/attendance/breaks/active': 'presence: who is on a rest now',
};

/*
  The phone names every request by its endpoint (`call(E.tasks.get, …)`), so
  the GETs are read from those names and resolved through the shared table:
  its method, its path, and its own `keep` verdict. A path is built with every
  argument set to a placeholder, which becomes `:x`; the query is dropped.
*/
const PLACEHOLDER = 'XPLACEHOLDERX';
const placeholderArgs = new Proxy({}, { get: (_t, k) => (k === 'then' ? undefined : PLACEHOLDER) });
const norm = (raw: string) =>
  raw.split('?')[0]!.split('/').map((seg) => (seg === PLACEHOLDER ? ':x' : seg)).join('/').replace(/\/$/, '');

function* walk(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      yield* walk(full);
    } else if (/\.(tsx?)$/.test(entry.name) && !/\.(spec|test)\./.test(entry.name)) {
      yield full;
    }
  }
}

type Def = { method: string; path: (a: unknown) => string; keep?: boolean | ((a: unknown) => boolean) };

function endpoints(): { file: string; ep: string; kept: boolean }[] {
  const out: { file: string; ep: string; kept: boolean }[] = [];
  for (const file of ['src', 'app'].flatMap((d) => [...walk(path.join(ROOT, d))])) {
    const src = strip(fs.readFileSync(file, 'utf8'));
    for (const m of src.matchAll(/\bE\.(\w+)\.(\w+)\b/g)) {
      const def = (apiEndpoints as unknown as Record<string, Record<string, Def> | undefined>)[m[1]!]?.[m[2]!];
      if (!def || def.method !== 'GET') continue;
      // A per-call verdict is read for the plain call (no presence filter) — the route as a screen first asks it.
      const keep = typeof def.keep === 'function' ? def.keep(undefined) : def.keep;
      const built = def.path(placeholderArgs);
      out.push({ file: path.relative(ROOT, file), ep: norm(built), kept: shouldKeep(built.split('?')[0]!, keep) });
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

  it.each(all)('$ep ($file)', ({ ep, kept }) => {
    const route = kept || OWN_READER[ep] || ONLINE_ONLY[ep];
    if (route) return expect(route).toBeTruthy();
    throw new Error(
      `GET ${ep} has no offline route.\n` +
        `Mark it \`keep: true\` in the shared endpoint table if its answer is the member's own data and safe to hold,\n` +
        `or to OWN_READER / ONLINE_ONLY in this file with the reason.`,
    );
  });

  it('lists nothing that has since been cached or deleted', () => {
    const live = new Set(all.map((r) => r.ep));
    for (const ep of Object.keys(OWN_READER)) expect([ep, live.has(ep)]).toEqual([ep, true]);
    for (const ep of Object.keys(ONLINE_ONLY)) {
      expect([ep, live.has(ep)]).toEqual([ep, true]);
      // An exemption that the cache now covers is an exemption to delete.
      expect([ep, all.find((r) => r.ep === ep)?.kept]).toEqual([ep, false]);
    }
  });
});
