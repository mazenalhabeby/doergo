/**
 * The source files the structure checks look at — the same roots and skips as the size ratchet.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const ROOTS = [
  'apps/api/auth-service/src',
  'apps/api/gateway/src',
  'apps/api/task-service/src',
  'apps/api/notification-service/src',
  'apps/api/tracking-service/src',
  'apps/web-app/src',
  'apps/mobile/src',
  'apps/mobile/app',
  'apps/admin/src',
  'packages/shared/src',
];

/** Tests, translations, generated code and content are not code to shape. */
export const SKIP = [
  /\.spec\.tsx?$/,
  /\.test\.tsx?$/,
  /\/__tests__\//,
  /\/__mocks__\//,
  /\/locales\//,
  /\.d\.ts$/,
  /\/generated\//,
  /\/migrations\//,
  /app\/help\/_content\//,
];

let cache = null;

/** Tracked + untracked (not ignored) .ts/.tsx files under the roots. */
export function sourceFiles() {
  if (cache) return cache;
  const listed = execSync(`git ls-files --cached --others --exclude-standard -- ${ROOTS.join(' ')}`, {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  cache = listed
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f) && !SKIP.some((re) => re.test(f)) && existsSync(join(REPO, f)));
  return cache;
}
