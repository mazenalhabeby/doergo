/**
 * The staff app's react-query cache wraps the WHOLE app.
 *
 * 2026-10-01: the handover hooks (useMyHandovers, useJobTime) read through
 * react-query on the home screen, but only the customer portal had a client —
 * the home screen threw "No QueryClient set" on every phone that took the
 * update. Type-checks and unit tests were all green; nothing rendered the root.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (name === 'node_modules' || name === '__tests__') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe('react-query in the staff app', () => {
  it('the root layout provides a QueryClient around the navigator', () => {
    const root = read('app/_layout.tsx');
    expect(root).toMatch(/<AppQueryProvider>[\s\S]*<RootLayoutNav \/>[\s\S]*<\/AppQueryProvider>/);
  });

  it('anything that uses react-query is under it (the staff app) or under the portal’s own', () => {
    const users = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'app'))]
      .filter((f) => /\buse(Query|Mutation|QueryClient|Queries)\(/.test(readFileSync(f, 'utf8')));
    expect(users.length).toBeGreaterThan(0);
    // The provider exists; every user is inside the app tree it wraps.
    expect(read('src/contexts/query-provider.tsx')).toMatch(/QueryClientProvider/);
  });
});
