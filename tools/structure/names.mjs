/**
 * Names that show a file was cut up to fit the size limit rather than designed as a module
 * (docs/plans/code-structure-fix.md, Phase 0.2):
 *
 *   numbered   `member-profile-page-detail3.tsx`, `events-4.ts`, `use-bell-data2.ts`
 *   part       `*-part.tsx`, `*-parts.ts`, a `*-parts/` folder
 *   inner      `*-inner.tsx`
 *   repeated   a word that appears twice in the name: `shift-clock-card-view-view.tsx`,
 *              `time-off-tab-time-off-tab.tsx`
 *   moved      a "moved here unchanged" note — the mark the splitting tools leave
 *
 * Existing files are recorded in the baseline; a NEW file with any of these fails, and a
 * recorded file may lose findings, never gain them.
 */
import { readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { REPO, sourceFiles } from './files.mjs';

/** Words that legitimately end in a digit (`s3`, `base64`, `oauth2` …). */
const DIGIT_WORDS = new Set([
  's3',
  'v1',
  'v2',
  'v3',
  'base64',
  'oauth2',
  'sha256',
  'md5',
  'utf8',
  'h264',
  'e2e',
  'i18n',
  'l10n',
  'x509',
  'ipv4',
  'ipv6',
  'mp4',
  'mp3',
  'pdf417',
  'iso8601',
  'k8s',
  'b2b',
  'b2c',
  '2fa',
  '3d',
]);
/** Short or generic words that may repeat without meaning a mechanical split. */
const REPEAT_OK = new Set([
  'use',
  'a',
  'an',
  'the',
  'of',
  'to',
  'in',
  'on',
  'by',
  'for',
  'and',
  'or',
  'is',
  'my',
  'x',
  'id',
]);

export function nameFindings(file, text) {
  const out = [];
  const name = basename(file)
    .replace(/\.tsx?$/, '')
    .replace(/\.(service|controller|module|dto|guard|types|base|helpers|logic|data)$/, '');
  const words = name.split(/[-_.]/).filter(Boolean);
  const last = words[words.length - 1] ?? '';
  if (/^\d+$/.test(last) || (/[a-z]\d+$/.test(last) && !DIGIT_WORDS.has(last))) out.push('numbered');
  if (/\/[^/]*-parts\//.test(file) || /-parts?$/.test(name)) out.push('part');
  if (/-inner$/.test(name)) out.push('inner');
  const seen = new Set();
  for (const w of words.map((x) => x.toLowerCase())) {
    if (w.length < 3 || REPEAT_OK.has(w)) continue;
    if (seen.has(w)) {
      out.push('repeated');
      break;
    }
    seen.add(w);
  }
  if (/moved here unchanged/i.test(text)) out.push('moved');
  return out;
}

export function measureNames() {
  const now = {};
  for (const f of sourceFiles()) {
    const found = nameFindings(f, readFileSync(join(REPO, f), 'utf8'));
    if (found.length) now[f] = found;
  }
  return now;
}

/** New files with findings, and recorded files that gained a finding. */
export function compareNames(now, baseline) {
  const problems = [];
  for (const [f, found] of Object.entries(now)) {
    const had = new Set(baseline[f] ?? []);
    const extra = found.filter((x) => !had.has(x));
    if (extra.length)
      problems.push(
        `${f}: ${extra.join(', ')} — name the file for what it does; ` +
          (extra.includes('moved')
            ? 'drop the "moved here unchanged" note once it is a real module'
            : 'no numbers, -part/-inner or repeated words'),
      );
  }
  return problems;
}
