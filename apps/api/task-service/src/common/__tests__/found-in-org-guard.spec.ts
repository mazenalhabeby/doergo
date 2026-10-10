import { NotFoundException } from '@nestjs/common';
import { assertFoundInOrg } from '@hbcfield/shared';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/*
  "Missing" and "another organization's" are ONE answer: `404 {What} not found`.

  It was written out by hand ~45 times, in two shapes, and the two-step shape is
  where production drifted into answering the second case with a 403 ("does not
  belong to your organization") — confirming to a stranger that the id is real.
  Found by probing prod on 2026-10-10; now one helper, `assertFoundInOrg`.
*/
describe('assertFoundInOrg', () => {
  it('passes a record of the caller’s organization through', () => {
    const rec = { id: 'a', organizationId: 'org-1' };
    expect(() => assertFoundInOrg(rec, 'org-1', 'Asset')).not.toThrow();
  });

  it('answers a missing record and another organization’s record IDENTICALLY', () => {
    const answer = (fn: () => void) => {
      try { fn(); } catch (e) { return [e instanceof NotFoundException, (e as Error).message]; }
      return null;
    };
    const missing = answer(() => assertFoundInOrg(null, 'org-1', 'Asset'));
    const foreign = answer(() => assertFoundInOrg({ organizationId: 'org-2' }, 'org-1', 'Asset'));
    expect(missing).toEqual([true, 'Asset not found']);
    expect(foreign).toEqual(missing);
  });

  it('a record with no organization is not the caller’s', () => {
    expect(() => assertFoundInOrg({ organizationId: null }, 'org-1', 'Sprint')).toThrow(NotFoundException);
  });
});

/*
  The guard: a NEW hand-written copy fails here, so the rule cannot quietly
  become two rules again. Nested ownership (an attachment's task, a type's
  category) is a different shape and is not matched.
*/
describe('no hand-written "missing or another org" checks in task-service', () => {
  const ROOT = join(__dirname, '..', '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== '__tests__' && name !== 'node_modules') walk(p); }
      else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) files.push(p);
    }
  };
  walk(ROOT);

  const ID = '[A-Za-z_$][\\w$]*';
  const shapes = [
    // if (!x || x.organizationId !== org) … NotFoundException('… not found')
    new RegExp(`if \\(!(${ID}) \\|\\| \\1\\.organizationId !== [\\w$.]+\\)[^;]*?NotFoundException\\('[^']+ not found'\\)`, 's'),
    // if (x.organizationId !== org) { throw new NotFoundException|ForbiddenException('… not found' | '…your organization') }
    new RegExp(`if \\((${ID})\\.organizationId !== [\\w$.]+\\) \\{?\\s*(?://[^\\n]*\\n\\s*)?throw new (?:NotFoundException\\('[^']+ not found'\\)|ForbiddenException\\('[^']*(?:belong to|in) your organization'\\))`),
  ];

  it('finds the sources it scans (sanity)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('every such check goes through assertFoundInOrg', () => {
    const offenders = files.flatMap((f) => {
      const src = readFileSync(f, 'utf8');
      return shapes.some((re) => re.test(src)) ? [f.slice(ROOT.length + 1)] : [];
    });
    expect(offenders).toEqual([]);
  });
});
