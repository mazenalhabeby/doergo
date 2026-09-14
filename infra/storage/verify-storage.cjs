#!/usr/bin/env node
/**
 * Does every file the database points at exist in the bucket?
 *
 * Run BEFORE switching storage provider (against the NEW bucket, after the
 * copy) and AFTER (against the live one). A missing object is a broken image, a
 * payslip that will not open, or a signature that cannot be sealed — and none of
 * them fail loudly on their own.
 *
 * Standalone on purpose: it runs inside the auth-service container, which has
 * @prisma/client and the AWS SDK but not a built @hbcfield/shared.
 *
 *   docker cp infra/storage/verify-storage.cjs hbcfield-auth-service:/tmp/
 *   docker exec -e S3_ENDPOINT=… -e S3_BUCKET=… -e S3_PUBLIC_BUCKET=… \
 *     -e S3_ACCESS_KEY=… -e S3_SECRET_KEY=… -e S3_REGION=auto \
 *     -e LEGACY_BASES="https://hel1.your-objectstorage.com/hbcfield" \
 *     hbcfield-auth-service node /tmp/verify-storage.cjs
 *
 * Exit 0 = everything present. Exit 1 = something is missing (listed).
 */
const path = require('path');
const { createRequire } = require('module');

function load(name) {
  const bases = ['/app/apps/api/auth-service/package.json', path.join(process.cwd(), 'package.json')];
  for (const base of bases) {
    try {
      return createRequire(base)(name);
    } catch {}
  }
  throw new Error(`Cannot load ${name} — run this inside the auth-service container`);
}

const { PrismaClient } = load('@prisma/client');
const { S3Client, HeadObjectCommand } = load('@aws-sdk/client-s3');

const env = (k, d) => process.env[k] || d;
const endpoint = env('S3_ENDPOINT');
const bucket = env('S3_BUCKET', 'hbcfield');
const publicBucket = env('S3_PUBLIC_BUCKET', bucket);
if (!endpoint || !env('S3_ACCESS_KEY') || !env('S3_SECRET_KEY')) {
  console.error('S3_ENDPOINT, S3_ACCESS_KEY and S3_SECRET_KEY are required');
  process.exit(2);
}
const s3 = new S3Client({
  endpoint,
  region: env('S3_REGION', 'auto'),
  credentials: { accessKeyId: env('S3_ACCESS_KEY'), secretAccessKey: env('S3_SECRET_KEY') },
  forcePathStyle: true,
});

// Every base a PUBLIC url in the database might begin with.
const publicBases = [env('S3_PUBLIC_BASE_URL'), `${endpoint.replace(/\/+$/, '')}/${publicBucket}`, ...env('LEGACY_BASES', '').split(',')]
  .map((b) => (b || '').trim().replace(/\/+$/, ''))
  .filter(Boolean);
const keyFromUrl = (url) => {
  if (!url) return null;
  for (const b of publicBases) if (url.startsWith(`${b}/`)) return decodeURIComponent(url.slice(b.length + 1).split('?')[0]);
  return null; // a relative /uploads/ path, or not ours
};

/** [label, bucket, SQL returning one column "k"] */
const PRIVATE = [
  ['task attachments', `SELECT "fileKey" AS k FROM attachments WHERE "fileKey" IS NOT NULL`],
  ['report photos', `SELECT "fileKey" AS k FROM report_attachments WHERE "fileKey" IS NOT NULL`],
  ['work-log files', `SELECT "fileKey" AS k FROM time_entry_note_attachments`],
  ['shift-issue files', `SELECT e->>'fileKey' AS k FROM shift_issue_events, jsonb_array_elements(CASE WHEN jsonb_typeof(attachments::jsonb) = 'array' THEN attachments::jsonb ELSE '[]'::jsonb END) e WHERE e->>'fileKey' IS NOT NULL`],
  ['expense receipts', `SELECT "receiptKey" AS k FROM asset_money WHERE "receiptKey" IS NOT NULL`],
  ['asset proposal pages', `SELECT "fileKey" AS k FROM asset_proposals WHERE "fileKey" IS NOT NULL`],
  ['documents', `SELECT "storageKey" AS k FROM documents UNION SELECT "originalKey" FROM documents WHERE "originalKey" IS NOT NULL`],
  ['signatures', `SELECT "signatureKey" AS k FROM document_signatures`],
];
const PUBLIC = [
  ['avatars', `SELECT "avatarUrl" AS k FROM users WHERE "avatarUrl" IS NOT NULL`],
  ['portal covers', `SELECT "coverImageUrl" AS k FROM portals WHERE "coverImageUrl" IS NOT NULL`],
  ['organization logos', `SELECT "logoUrl" AS k FROM organizations WHERE "logoUrl" IS NOT NULL`],
];

async function exists(b, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: b, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function check(label, b, keys) {
  const unique = [...new Set(keys)];
  const missing = [];
  let i = 0;
  const worker = async () => {
    while (i < unique.length) {
      const key = unique[i++];
      if (!(await exists(b, key))) missing.push(key);
    }
  };
  await Promise.all(Array.from({ length: 16 }, worker));
  console.log(`${missing.length ? '✗' : '✓'} ${label.padEnd(22)} ${String(unique.length).padStart(6)} objects  ${missing.length} missing`);
  for (const k of missing.slice(0, 10)) console.log(`    missing: ${k}`);
  return missing.length;
}

(async () => {
  const prisma = new PrismaClient();
  let missing = 0;
  let skipped = 0;
  try {
    console.log(`bucket ${bucket} · public bucket ${publicBucket} · ${endpoint}\n`);
    for (const [label, sql] of PRIVATE) {
      const rows = await prisma.$queryRawUnsafe(sql);
      missing += await check(label, bucket, rows.map((r) => r.k).filter(Boolean));
    }
    for (const [label, sql] of PUBLIC) {
      const rows = await prisma.$queryRawUnsafe(sql);
      const urls = rows.map((r) => r.k).filter(Boolean);
      const keys = urls.map(keyFromUrl).filter(Boolean);
      skipped += urls.length - keys.length;
      missing += await check(label, publicBucket, keys);
    }
  } finally {
    await prisma.$disconnect();
  }
  if (skipped) console.log(`\n${skipped} public URL(s) are not bucket URLs (local /uploads paths or external links) — not checked.`);
  console.log(missing ? `\n✗ ${missing} object(s) missing — do NOT switch.` : '\n✓ Every stored file is present.');
  process.exit(missing ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
