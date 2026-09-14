/**
 * ⚠️ One object store, enforced.
 *
 * Eight services each built their own S3 client from the same five environment
 * variables, with different defaults, and wrote the provider's hostname into
 * database rows. Moving provider meant eight edits, a data rewrite, and a
 * guarantee of missing one. This fails if a ninth appears.
 *
 * Allowed: the shared store itself, and seed scripts (not runtime code).
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '../../../../../..');
const SCAN = ['apps/api/gateway/src', 'apps/api/task-service/src', 'apps/api/auth-service/src', 'apps/api/notification-service/src', 'apps/api/tracking-service/src'];
const ALLOWED = new Set(['packages/shared/src/storage/object-store.ts']);

function* files(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist' || name === '__tests__') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (path.endsWith('.ts') && !path.endsWith('.spec.ts')) yield path;
  }
}

// `//` after a colon is a URL, not a comment — stripping it would blind the provider check.
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('a single object store', () => {
  const offenders = (pattern: RegExp) =>
    SCAN.flatMap((d) => [...files(join(ROOT, d))])
      .map((f) => relative(ROOT, f))
      .filter((f) => !ALLOWED.has(f))
      .filter((f) => pattern.test(strip(readFileSync(join(ROOT, f), 'utf8'))));

  it('no service constructs its own S3 client', () => {
    expect(offenders(/new\s+S3Client\s*\(/)).toEqual([]);
  });

  it('no service signs URLs outside the shared store', () => {
    expect(offenders(/@aws-sdk\/s3-request-presigner/)).toEqual([]);
  });

  it('no service hard-codes the storage provider', () => {
    expect(offenders(/your-objectstorage\.com|r2\.cloudflarestorage\.com/)).toEqual([]);
  });
});
