import { personName } from '@hbcfield/shared';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/*
  A person's name is ONE rule: `personName()`. It was written out by hand ~90
  times as `${u.firstName} ${u.lastName}`, which prints "John null" for somebody
  with no surname on file and leaves a trailing space (audit 2026-10-16).
*/
describe('personName', () => {
  it('drops a missing part instead of printing it', () => {
    expect(personName({ firstName: 'John', lastName: null })).toBe('John');
    expect(personName({ firstName: ' Anna ', lastName: 'Müller' })).toBe('Anna Müller');
    expect(personName(undefined)).toBe('');
  });
});

describe('no hand-built "First Last" names', () => {
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

  it('a name that is the WHOLE string goes through personName', () => {
    // Only the whole-string shape: a name inside a longer sentence or a log line is not matched.
    const shape = /`\$\{([\w$.?!]+?)\??\.firstName(?: \?\? '')?\} \$\{\1\??\.lastName(?: \?\? '')?\}`/;
    const offenders = files
      .filter((f) => !f.endsWith('person-name.ts'))
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
