// Split a template literal WITH ${…} that sits on a line over 140 into two templates joined by +,
// cut at a ${ boundary near the middle. Both halves are still templates, so every value is
// converted exactly as before; the joined string is the same.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
for (const file of process.argv.slice(2)) {
  let src = fs.readFileSync(file, 'utf8');
  const long = new Set(src.split('\n').map((l, i) => (l.length > 140 ? i : -1)).filter((i) => i >= 0));
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = [];
  const visit = (n) => {
    if (ts.isTemplateExpression(n) && !ts.isTaggedTemplateExpression(n.parent)) {
      const start = n.getStart(sf);
      const line = sf.getLineAndCharacterOfPosition(start).line;
      const text = src.slice(start, n.end);
      if (long.has(line) && !text.includes('\n') && text.length > 60 && n.templateSpans.length >= 2) {
        // The span whose ${ is closest to the middle (never the first: piece 1 must hold something).
        let best = null;
        for (const span of n.templateSpans.slice(1)) {
          const at = span.expression.getStart(sf) - 2; // the "${"
          if (src.slice(at, at + 2) !== '${') continue;
          const d = Math.abs(at - start - text.length / 2);
          if (!best || d < best.d) best = { at, d };
        }
        if (best) {
          const p1 = src.slice(start, best.at) + '`';
          const p2 = '`' + src.slice(best.at, n.end);
          edits.push({ start, end: n.end, text: `(${p1} + ${p2})` });
          return;
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  for (const e of edits.sort((a, b) => b.start - a.start)) src = src.slice(0, e.start) + e.text + src.slice(e.end);
  if (edits.length) { fs.writeFileSync(file, src); console.log(`split ${edits.length} template(s) in ${file}`); }
}
