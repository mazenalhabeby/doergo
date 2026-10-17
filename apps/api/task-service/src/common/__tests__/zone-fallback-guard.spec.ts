import { zoneOf } from '@hbcfield/shared';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/*
  "Which zone when none is set" is ONE rule: `zoneOf(...)` — the first zone
  given, else UTC. It was written out by hand ~43 times; most said UTC and seven
  said Europe/Berlin, so the same workspace could get two different "todays"
  depending on which code path asked (audit 2026-10-16, B1).
*/
describe('zoneOf', () => {
  it('takes the first zone that is set, in the order given', () => {
    expect(zoneOf(null, 'America/New_York', 'Europe/Vienna')).toBe('America/New_York');
    expect(zoneOf('', undefined, 'Europe/Vienna')).toBe('Europe/Vienna');
  });

  it('falls back to UTC, never the server or a hard-coded city', () => {
    expect(zoneOf()).toBe('UTC');
    expect(zoneOf(null, undefined, '')).toBe('UTC');
  });
});

/*
  The guard: a NEW hand-written fallback fails here. Organization-level calendar
  defaults ('Europe/Vienna', the column's own default) are a separate, open
  decision and are not matched.
*/
describe('no hand-written zone fallbacks', () => {
  const REPO = join(__dirname, '..', '..', '..', '..', '..', '..');
  const ROOTS = [
    'apps/api/auth-service/src',
    'apps/api/gateway/src',
    'apps/api/task-service/src',
    'apps/api/notification-service/src',
    'apps/api/tracking-service/src',
    'packages/shared/src',
  ];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== '__tests__' && name !== 'node_modules') walk(p);
      } else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) files.push(p);
    }
  };
  for (const r of ROOTS) walk(join(REPO, r));

  it('every "no zone set" default goes through zoneOf', () => {
    const shape = /(?:\|\||\?\?)\s*'(?:UTC|Europe\/Berlin)'/;
    const offenders = files
      .filter((f) => !f.endsWith('workspace-zone.ts'))
      .flatMap((f) =>
        readFileSync(f, 'utf8')
          .split('\n')
          .map((line, i) => (shape.test(line) ? `${relative(REPO, f)}:${i + 1}` : null))
          .filter(Boolean),
      );
    expect(files.length).toBeGreaterThan(500);
    expect(offenders).toEqual([]);
  });
});
