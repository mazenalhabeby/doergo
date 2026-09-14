#!/usr/bin/env node
/**
 * Point public image URLs (avatars, portal covers, organization logos) at the
 * new public base.
 *
 * Private files need nothing: their rows hold KEYS, and links are signed at
 * read time. Public images are rendered straight from a URL stored in the row,
 * so those rows are the one thing a provider move has to rewrite.
 *
 * Dry run by default. Pass --apply to write, in one transaction.
 *
 *   docker exec hbcfield-auth-service node /tmp/rewrite-public-urls.cjs \
 *     --from https://hel1.your-objectstorage.com/hbcfield \
 *     --to https://files.hbcfield.com [--apply]
 */
const path = require('path');
const { createRequire } = require('module');

function load(name) {
  for (const base of ['/app/apps/api/auth-service/package.json', path.join(process.cwd(), 'package.json')]) {
    try {
      return createRequire(base)(name);
    } catch {}
  }
  throw new Error(`Cannot load ${name} — run this inside the auth-service container`);
}
const { PrismaClient } = load('@prisma/client');

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const from = (arg('--from') || '').replace(/\/+$/, '');
const to = (arg('--to') || '').replace(/\/+$/, '');
const apply = process.argv.includes('--apply');
if (!/^https:\/\//.test(from) || !/^https:\/\//.test(to)) {
  console.error('--from and --to must both be https:// bases');
  process.exit(2);
}

const COLUMNS = [
  ['users', 'avatarUrl'],
  ['portals', 'coverImageUrl'],
  ['organizations', 'logoUrl'],
];

(async () => {
  const prisma = new PrismaClient();
  try {
    const like = `${from.replace(/[\\%_]/g, (c) => `\\${c}`)}/%`;
    for (const [table, col] of COLUMNS) {
      const [{ n }] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${table}" WHERE "${col}" LIKE $1`, like);
      console.log(`${table}.${col}: ${n} row(s) to rewrite`);
    }
    if (!apply) {
      console.log('\nDry run. Re-run with --apply to write.');
      return;
    }
    await prisma.$transaction(
      COLUMNS.map(([table, col]) =>
        prisma.$executeRawUnsafe(
          `UPDATE "${table}" SET "${col}" = $1 || substring("${col}" from $2) WHERE "${col}" LIKE $3`,
          to,
          from.length + 1,
          like,
        ),
      ),
    );
    console.log('\n✓ Rewritten.');
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
