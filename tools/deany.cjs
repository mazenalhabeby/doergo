// Try to remove each `any` in task-service src (non-test), one edit at a time; keep an edit only if
// the whole project still typechecks with zero errors. Types only — casts and annotations erase.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = '/Users/pc/work/doergo/apps/api/task-service';
const TSC = path.join(ROOT, 'node_modules/.bin/tsc');
const tscBin = fs.existsSync(TSC) ? TSC : '/Users/pc/work/doergo/node_modules/.bin/tsc';
const only = process.argv.slice(2);

function files(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') files(p, out); }
    else if (/\.ts$/.test(e.name) && !/\.(spec|d)\.ts$/.test(e.name) && !/fixture/.test(e.name)) out.push(p);
  }
  return out;
}
function ok() {
  try { execSync(`${tscBin} --noEmit -p tsconfig.json`, { cwd: ROOT, stdio: 'pipe' }); return true; }
  catch { return false; }
}

// Candidate rewrites for one line, most precise first. Each returns the new line or null.
const RULES = [
  [/ as any\[\](?! as)/, ''],             // drop `as any[]`
  [/ as any(?![\w\[])(?! as)/, ''],        // drop `as any`
  [/(\(|, )(\w+): any(?=[,)])/, '$1$2'],   // callback/param `(a: any)` → inferred
  [/\bcatch \((\w+): any\)/, 'catch ($1: unknown)'],
  [/(const|let) (\w+): any = /, '$1 $2 = '],
  [/: any\[\]/, ': unknown[]'],
  [/: any\b/, ': unknown'],
  [/<any>/, '<unknown>'],
  [/, any>/, ', unknown>'],
];

if (!ok()) { console.error('project does not typecheck before starting'); process.exit(1); }
let kept = 0, tried = 0;
for (const f of files(path.join(ROOT, 'src'))) {
  if (only.length && !only.some((o) => f.includes(o))) continue;
  let lines = fs.readFileSync(f, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
    // Repeat on the same line until no rule applies (a line may hold several).
    for (let guard = 0; guard < 6 && /\bany\b/.test(lines[i]); guard++) {
      let applied = false;
      for (const [re, rep] of RULES) {
        if (!re.test(lines[i])) continue;
        const before = lines[i];
        const after = before.replace(re, rep);
        if (after === before) continue;
        lines[i] = after; tried++;
        fs.writeFileSync(f, lines.join('\n'));
        if (ok()) { kept++; applied = true; console.log(`kept  ${path.relative(ROOT, f)}:${i + 1}`); break; }
        lines[i] = before; fs.writeFileSync(f, lines.join('\n'));
      }
      if (!applied) break;
    }
  }
}
console.log(`done: ${kept} kept of ${tried} tried`);
