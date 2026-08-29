/**
 * Laying a contract out on a page — the arithmetic, separate from the PDF.
 *
 * Kept pure so it can be asserted exactly. The rendered bytes are hashed and
 * frozen the moment a contract is issued, and the hash is the tamper evidence,
 * so the layout must be DETERMINISTIC: the same template and the same values
 * must produce the same lines on the same pages, today and in five years.
 * Anything that varies — a clock, a locale, a font that resolves differently on
 * another machine — would break that quietly.
 *
 * The PDF writer takes this plan and draws it. It makes no layout decisions of
 * its own.
 */

/** A4 at 72 dpi, which is what PDF points are. */
export const PAGE = { width: 595.28, height: 841.89 } as const;

export const MARGIN = { top: 64, bottom: 72, left: 56, right: 56 } as const;

export const TYPE_SCALE = {
  title: { size: 18, leading: 24, spaceAfter: 18, bold: true },
  heading: { size: 12, leading: 17, spaceAfter: 6, bold: true },
  body: { size: 10.5, leading: 15, spaceAfter: 10, bold: false },
  small: { size: 8.5, leading: 12, spaceAfter: 6, bold: false },
} as const;

export type BlockStyle = keyof typeof TYPE_SCALE;

/** One paragraph of source text, before wrapping. */
export interface SourceBlock {
  style: BlockStyle;
  text: string;
}

/** One drawn line, positioned. */
export interface LaidOutLine {
  text: string;
  x: number;
  y: number;
  size: number;
  bold: boolean;
}

export interface LaidOutPage {
  lines: LaidOutLine[];
}

/** Measures a string at a size. Injected so the caller uses the real font. */
export type Measure = (text: string, size: number, bold: boolean) => number;

export const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;

/**
 * Turn a template body into blocks.
 *
 * The grammar is deliberately tiny — a blank line ends a paragraph, and a line
 * that both starts with `§` or `#` and is short is a heading. A template is
 * written by an administrator in a textarea, not by someone learning a markup
 * language, and a richer syntax would mostly produce documents with stray
 * asterisks in them.
 */
export function parseBlocks(body: string, title?: string): SourceBlock[] {
  const blocks: SourceBlock[] = [];
  if (title) blocks.push({ style: 'title', text: title });

  for (const raw of body.replace(/\r\n/g, '\n').split(/\n{2,}/)) {
    const text = raw.trim().replace(/\s*\n\s*/g, ' ');
    if (!text) continue;
    const isHeading = /^[§#]/.test(text) && text.length <= 80;
    blocks.push({
      style: isHeading ? 'heading' : 'body',
      text: isHeading ? text.replace(/^#+\s*/, '') : text,
    });
  }
  return blocks;
}

/**
 * Break a paragraph into lines that fit.
 *
 * A word longer than the line — a URL, a 40-character compound noun, which
 * German produces routinely — is split rather than allowed to overflow the
 * margin, because a contract with text running off the page is not a contract
 * anyone would sign.
 */
export function wrap(text: string, size: number, bold: boolean, width: number, measure: Measure): string[] {
  const out: string[] = [];
  let line = '';

  const push = () => {
    if (line) out.push(line);
    line = '';
  };

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate, size, bold) <= width) {
      line = candidate;
      continue;
    }
    push();

    if (measure(word, size, bold) <= width) {
      line = word;
      continue;
    }
    // Hard-split an unbreakable word, one character at a time so the check is
    // exact rather than an estimate that can still overflow.
    let chunk = '';
    for (const ch of word) {
      if (measure(chunk + ch, size, bold) > width) {
        out.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    line = chunk;
  }
  push();
  return out.length > 0 ? out : [''];
}

/**
 * Place every block on pages.
 *
 * A heading whose paragraph would start on the next page is moved down with it:
 * a "§4 Working time" alone at the foot of a page reads as a document that was
 * cut, which is not the impression an employment contract should give.
 */
export function layout(blocks: SourceBlock[], measure: Measure): LaidOutPage[] {
  const pages: LaidOutPage[] = [{ lines: [] }];
  let page = pages[0]!;
  let y = PAGE.height - MARGIN.top;
  const floor = MARGIN.bottom;

  const newPage = () => {
    page = { lines: [] };
    pages.push(page);
    y = PAGE.height - MARGIN.top;
  };

  blocks.forEach((block, index) => {
    const s = TYPE_SCALE[block.style];
    const lines = wrap(block.text, s.size, s.bold, CONTENT_WIDTH, measure);
    const blockHeight = lines.length * s.leading;

    if (block.style === 'heading') {
      // Keep the heading with at least the first two lines of what follows.
      const next = blocks[index + 1];
      const nextLead = next
        ? TYPE_SCALE[next.style].leading * 2 + TYPE_SCALE[next.style].spaceAfter
        : 0;
      if (y - (blockHeight + s.spaceAfter + nextLead) < floor) newPage();
    } else if (y - blockHeight < floor && y < PAGE.height - MARGIN.top) {
      newPage();
    }

    for (const text of lines) {
      if (y - s.leading < floor) newPage();
      y -= s.leading;
      page.lines.push({ text, x: MARGIN.left, y, size: s.size, bold: s.bold });
    }
    y -= s.spaceAfter;
  });

  return pages;
}

/**
 * Characters the PDF standard fonts cannot encode.
 *
 * pdf-lib's built-in Helvetica is WinAnsi, which covers German, French, Spanish
 * and Italian — every language this product ships in — but not, say, Polish or
 * Czech. Returning the offending characters lets the caller REFUSE to render
 * rather than emit a contract with black squares where somebody's surname
 * should be.
 */
export function unencodableCharacters(text: string): string[] {
  const bad = new Set<string>();
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x0a || code === 0x0d || code === 0x09) continue;
    // WinAnsi: ASCII plus Latin-1 plus a handful of typographic characters.
    const ok =
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0xa0 && code <= 0xff) ||
      [0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
       0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
       0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
      ].includes(code);
    if (!ok) bad.add(ch);
  }
  return [...bad];
}
