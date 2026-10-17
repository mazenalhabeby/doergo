import { activeWindowWhere, notEndedWhere } from '@hbcfield/shared';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/*
  "Is this assignment in force" was written out by hand ~60 times (audit
  2026-10-16). Two rules, kept apart on purpose:
  - activeWindowWhere: started AND not ended — "assigned right now";
  - notEndedWhere: not ended only — the roster including future-dated rows.
*/
describe('assignment window helpers', () => {
  const now = new Date('2026-10-16T10:00:00Z');

  it('activeWindowWhere carries both bounds', () => {
    expect(activeWindowWhere(now)).toEqual({
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    });
  });

  it('notEndedWhere carries only the end bound', () => {
    expect(notEndedWhere(now)).toEqual({ OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] });
  });
});

describe('no hand-written assignment windows', () => {
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

  it('every "not ended" window goes through the shared helpers', () => {
    // `gt` (member-offboard: ends strictly after now) is a different rule and is not matched.
    const shape = /\{\s*effectiveTo:\s*null\s*\},\s*\{\s*effectiveTo:\s*\{\s*gte:/;
    const offenders = files
      .filter((f) => !f.endsWith('assignment-window.ts'))
      .filter((f) => shape.test(readFileSync(f, 'utf8')))
      .map((f) => relative(REPO, f));
    expect(files.length).toBeGreaterThan(500);
    expect(offenders).toEqual([]);
  });
});
