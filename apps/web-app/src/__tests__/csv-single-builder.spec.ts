import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { csvCell, toCsv } from '@hbcfield/shared/client';

/*
  ONE CSV builder: `toCsv` / `csvCell` in packages/shared.

  The report export quoted its cells and still shipped formula injection: a
  client called `=HYPERLINK(…)` or a note starting with "+" ran as a formula on
  the office PC that opened the file. The header row was not even escaped. The
  task-service attendance export had the same code, written separately.

  So the rules live in one helper, and this test fails when a hand-rolled
  builder appears: quote-doubling written in place, or a file that produces a
  `text/csv` / `.csv` download without going through the shared helper.
*/

const SRC = join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next' || e === '__tests__') continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full) && !/\.spec\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/** Comments may describe a builder; only code counts. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const QUOTE_DOUBLING = /\.replace(All)?\(\s*(\/"\/g|['"`]"['"`])\s*,\s*['"`]""['"`]\s*\)/;
const CSV_OUTPUT = /text\/csv|\.csv['"`]/;
const USES_SHARED = /\b(toCsv|csvCell)\b/;

describe('one CSV builder', () => {
  const files = walk(SRC).map((f) => ({ f: relative(SRC, f), src: stripComments(readFileSync(f, 'utf8')) }));

  it('no file doubles quotes by hand', () => {
    expect(files.filter(({ src }) => QUOTE_DOUBLING.test(src)).map(({ f }) => f)).toEqual([]);
  });

  it('every CSV download goes through toCsv / csvCell', () => {
    expect(files.filter(({ src }) => CSV_OUTPUT.test(src) && !USES_SHARED.test(src)).map(({ f }) => f)).toEqual([]);
  });

  it('the guard itself still recognises a hand-rolled builder', () => {
    expect(QUOTE_DOUBLING.test(`x.replace(/"/g, '""')`)).toBe(true);
    expect(CSV_OUTPUT.test(`new Blob([s], { type: "text/csv" })`)).toBe(true);
  });
});

describe('csvCell / toCsv', () => {
  it('defuses every formula start', () => {
    for (const c of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx']) {
      expect(csvCell(c)).toBe(`"'${c}"`);
    }
  });

  it('quotes everything and doubles inner quotes', () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell(12.5)).toBe('"12.5"');
    expect(csvCell('x=1')).toBe('"x=1"');
  });

  it('writes a real negative number as a number, but defuses text that looks like one', () => {
    expect(csvCell(-5)).toBe('"-5"');
    expect(csvCell('-5')).toBe(`"'-5"`);
  });

  it('escapes the header row too', () => {
    const csv = toCsv([{ a: '=evil' }], [{ header: '=Head "1"', value: (r) => r.a }]);
    expect(csv).toBe(`"'=Head ""1"""\r\n"'=evil"`);
  });
});
