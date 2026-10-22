/**
 * pdf.js, loaded on first use and never at boot (it is about a megabyte).
 *
 * ⚠️ `import()` through `new Function`: this service compiles to CommonJS, and
 * TypeScript would rewrite a plain dynamic import into `require()`, which throws
 * on pdf.js's ESM-only build — at runtime, with an error that says nothing about
 * why. A failed load is forgotten, so the next PDF tries again.
 *
 * Its own module so tests can hand in pdf.js directly: under Jest, an import
 * built this way resolves against the first test file's (torn-down) environment.
 */
const esmImport = new Function('s', 'return import(s)') as (s: string) => Promise<any>;
let pdfjsModule: Promise<any> | null = null;

export function loadPdfjs(): Promise<any> {
  return (pdfjsModule ??= esmImport('pdfjs-dist/legacy/build/pdf.mjs').catch((e) => {
    pdfjsModule = null;
    throw e;
  }));
}
