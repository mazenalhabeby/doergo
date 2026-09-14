import fs from 'fs';
import path from 'path';

/**
 * A request body can never stand in for the caller.
 *
 * The shift-issue routes built their payload as `{ ...this.ctx(req), ...body }`
 * with an untyped body: the verified identity went in first and the body was
 * spread over it, so a member who sent `"canManage": true` or somebody else's
 * `callerUserId` BECAME that. The global whitelist cannot help — a plain type
 * carries no validation metadata.
 *
 * This walks every gateway controller and fails if, inside one object literal,
 * the body or DTO is spread AFTER anything taken from the request's user.
 * Spread the body first; put identity last.
 */
const ROOT = path.join(__dirname, '../../modules');

function controllerFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...controllerFiles(full));
    else if (entry.name.endsWith('.controller.ts')) out.push(full);
  }
  return out;
}

/** Innermost `{ … }` literals, comments removed. */
function literals(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  return code.match(/\{[^{}]*\}/g) ?? [];
}

const IDENTITY = /(req\.user\b|request\.user\b|\buser\.(id|organizationId|role)\b|this\.ctx\(|\bctx\()/;
const BODY_SPREAD = /\.\.\.(body|dto|input|payload)\b/;

describe('request bodies and the caller', () => {
  it('never spreads a body after the caller identity', () => {
    const offenders: string[] = [];
    for (const file of controllerFiles(ROOT)) {
      for (const lit of literals(fs.readFileSync(file, 'utf8'))) {
        const spread = lit.search(BODY_SPREAD);
        if (spread === -1) continue;
        const identity = lit.search(IDENTITY);
        if (identity !== -1 && identity < spread) {
          offenders.push(`${path.relative(ROOT, file)}: ${lit.replace(/\s+/g, ' ').slice(0, 140)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
