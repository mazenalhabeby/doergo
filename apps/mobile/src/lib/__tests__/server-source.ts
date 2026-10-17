import fs from 'fs';
import path from 'path';

/**
 * Every source file of one server module folder, concatenated — the gateway's
 * controllers are split by job (2026-10-16), so a guard reads the folder.
 * `filter` narrows it (for example to controllers).
 */
export function serverModuleSource(dir: string, filter: (file: string) => boolean = () => true): string {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && filter(f))
    .sort()
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n');
}
