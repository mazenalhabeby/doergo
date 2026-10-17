#!/usr/bin/env node
/**
 * After a move-only split: every code line of the original must appear in the new
 * files (as many times as before). Import lists, the class line and the constructor
 * are expected to change and are skipped; anything else missing is printed.
 *
 *   node tools/verify-move.mjs <original copy> <new files…>
 */
import { readFileSync } from 'node:fs';
const [orig, ...files] = process.argv.slice(2);
const count = (lines) => lines.reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map());
const skip =
  /^import |^\} from |^\s+[A-Za-z_$][\w$]*,?$|^\s+type [A-Za-z_$][\w$]*,?$|^\s+[A-Za-z_$, ]+,$|^export (abstract )?class |^\s+(private|protected|public) readonly \w+[?]?: |^\s+@(Inject|Optional)\(/;
const want = readFileSync(orig, 'utf8')
  .split('\n')
  .filter((l) => l.trim() && !skip.test(l));
const have = count(files.flatMap((f) => readFileSync(f, 'utf8').split('\n')));
const missing = [];
for (const [l, n] of count(want)) if ((have.get(l) ?? 0) < n) missing.push(l);
console.log(`${want.length} code lines; ${missing.length} not found as they were`);
for (const l of missing) console.log('  ' + l.trim().slice(0, 130));
process.exit(0);
