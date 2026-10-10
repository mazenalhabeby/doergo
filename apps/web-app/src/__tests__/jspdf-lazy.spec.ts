import fs from 'fs';
import path from 'path';

/**
 * jsPDF must load on the click, never with the page.
 *
 * jspdf + jspdf-autotable are ~350 kB of JavaScript. They were imported at
 * module scope by the invoice page, by the statement tab (so EVERY member
 * profile carried them) and by the report export dialog (so the reports page
 * did) — to serve a button most visits never press. The job report page already
 * did it right: `await import("./_lib/job-report-pdf")` inside the handler.
 *
 * The trap is the same one `i18n-client-bundle.spec.ts` documents: an import is
 * a MODULE, not a symbol. Importing `PDF_TEMPLATES` (a list of four names) from
 * the renderer module put the renderer in the page. The dialog's choices now
 * live in `lib/report-pdf-options.ts`, which imports no jsPDF.
 *
 * So this walks the real static import graph from every `.tsx` file (every page
 * and component) and fails if it reaches `jspdf` or `jspdf-autotable`.
 *
 * Not followed, on purpose:
 * • `import('…')` — a dynamic import is a code-split point; that is the fix.
 * • `import type …` / `export type …` / `import { type A, type B }` — erased at
 *   compile time, so a page may name `InvoicePdfData` without paying for jsPDF.
 */

const SRC = path.join(process.cwd(), 'src');
const EXT = ['.ts', '.tsx', '.js', '.jsx'];
const HEAVY = new Set(['jspdf', 'jspdf-autotable']);

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__tests__') continue;
      walkFiles(p, out);
    } else if (EXT.includes(path.extname(e.name)) && !/\.spec\.tsx?$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

function resolve(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  const candidates = [base, ...EXT.map((e) => base + e), ...EXT.map((e) => path.join(base, 'index' + e))];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null;
}

/** Comments quote forbidden imports when they explain the rule — strip them first. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Static, VALUE-carrying imports/re-exports only. */
export function valueImports(src: string): string[] {
  const code = stripComments(src);
  const specs: string[] = [];
  // `import X from`, `import { … } from`, `import * as`, `import 'side-effect'`,
  // `export { … } from`, `export * from`. Never `import(` (dynamic).
  const re = /(?:^|\n)\s*(import|export)\s+(?!\()([^'"();]*?\sfrom\s*)?['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const clause = (m[2] ?? '').trim();
    if (/^type\s/.test(clause)) continue; // import type … / export type …
    const braces = /^\{([\s\S]*)\}\s*from$/.exec(clause);
    if (braces) {
      const names = braces[1].split(',').map((s) => s.trim()).filter(Boolean);
      if (names.length > 0 && names.every((n) => /^type\s/.test(n))) continue;
    }
    specs.push(m[3]);
  }
  return specs;
}

const rel = (f: string) => path.relative(process.cwd(), f).replace(/\\/g, '/');

/** BFS; returns the chain from `entry` to a jsPDF import, or null. */
function chainToJsPdf(entry: string): string[] | null {
  const seen = new Set<string>([entry]);
  const queue: { file: string; chain: string[] }[] = [{ file: entry, chain: [rel(entry)] }];
  while (queue.length) {
    const { file, chain } = queue.shift()!;
    for (const spec of valueImports(fs.readFileSync(file, 'utf8'))) {
      if (HEAVY.has(spec)) return [...chain, spec];
      const next = resolve(spec, file);
      if (!next || seen.has(next)) continue;
      seen.add(next);
      queue.push({ file: next, chain: [...chain, rel(next)] });
    }
  }
  return null;
}

describe('jsPDF is loaded on demand, never with a page or component', () => {
  const ui = walkFiles(SRC).filter((f) => f.endsWith('.tsx'));

  it('finds pages and components to check (the walk must not silently pass)', () => {
    expect(ui.length).toBeGreaterThan(100);
  });

  it('the walker sees a real jsPDF import (the PDF builders themselves)', () => {
    // If this ever stops matching, the scanner is broken and the next test is
    // passing for the wrong reason.
    for (const builder of ['src/lib/invoice-pdf.ts', 'src/lib/statement-pdf.ts', 'src/lib/report-pdf.ts']) {
      expect(chainToJsPdf(path.join(process.cwd(), builder))).not.toBeNull();
    }
  });

  it('no .tsx file statically reaches jspdf or jspdf-autotable', () => {
    const offenders = ui
      .map(chainToJsPdf)
      .filter((c): c is string[] => c !== null)
      .map((c) => c.join('\n      -> '));
    expect(offenders).toEqual([]);
  });

  it('type-only imports and dynamic imports are not counted', () => {
    expect(valueImports(`import type { A } from "jspdf"`)).toEqual([]);
    expect(valueImports(`import { type A, type B } from "jspdf"`)).toEqual([]);
    expect(valueImports(`const m = await import("jspdf")`)).toEqual([]);
    expect(valueImports(`// import jsPDF from "jspdf"`)).toEqual([]);
    expect(valueImports(`import { type A, b } from "jspdf"`)).toEqual(['jspdf']);
    expect(valueImports(`import jsPDF from "jspdf"`)).toEqual(['jspdf']);
  });
});
