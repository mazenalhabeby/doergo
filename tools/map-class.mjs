#!/usr/bin/env node
/** Print a class's members: size, route/pattern decorator, and the `this.x(` calls — to plan a split. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const ts = createRequire(import.meta.url)('typescript');
const file = process.argv[2];
const src = readFileSync(file, 'utf8');
const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
for (const st of sf.statements) {
  if (!ts.isClassDeclaration(st)) continue;
  console.log('CLASS', st.name?.text, (ts.getDecorators(st) ?? []).map((d) => d.getText(sf)).join(' '));
  for (const m of st.members) {
    const n = m.name ? m.name.getText(sf) : 'ctor';
    const lines = src.slice(m.getFullStart(), m.getEnd()).split('\n').length;
    const d =
      (ts.getDecorators(m) ?? [])
        .map((x) => x.getText(sf))
        .find((t) => /^@(Get|Post|Patch|Put|Delete|MessagePattern|EventPattern|Cron|SubscribeMessage)/.test(t)) ?? '';
    const calls = [
      ...new Set((src.slice(m.getStart(sf), m.getEnd()).match(/this\.(\w+)\(/g) ?? []).map((x) => x.slice(5, -1))),
    ];
    console.log('  ' + n.padEnd(32), String(lines).padStart(4), d.slice(0, 48).padEnd(48), calls.join(','));
  }
}
