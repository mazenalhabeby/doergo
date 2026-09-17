/**
 * Title and end cards, drawn as HTML and screenshotted by the browser the
 * pipeline already runs.
 *
 * ⚠️ THIS IS THE REASON REMOTION IS NOT A DEPENDENCY. Remotion's whole value
 * here would be "render a React component to frames" — but Playwright is
 * already installed for capture, it already renders HTML at exactly the
 * recording viewport, and a static card needs one frame, not a frame loop. So
 * a card costs one screenshot and one `-loop 1` in ffmpeg, against a second
 * rendering stack and its own Chromium download.
 *
 * The side benefit is that the cards are built from the product's own design
 * tokens — the same blue, the same Inter, the same slate — so they look like
 * HBCField rather than like a video editor's title preset.
 */

import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { OUTPUT } from '../config.ts';

/** From packages/shared/src/design/tokens.ts. Kept in step by eye, not by import:
 *  pulling the token module in would drag the whole design package into a
 *  script whose only job is to draw two pictures. */
const BRAND = '#2563EB';
const INK = '#0F172A';
const MUTED = '#94A3B8';

interface CardContent {
  eyebrow: string;
  title: string;
  subtitle: string;
}

function cardHtml({ eyebrow, title, subtitle }: CardContent, variant: 'title' | 'end'): string {
  const isEnd = variant === 'end';
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: ${OUTPUT.width}px; height: ${OUTPUT.height}px;
    background: ${INK};
    font-family: Inter, -apple-system, "Helvetica Neue", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }
  /* A slow diagonal wash, so the card is not a flat rectangle. */
  body::before {
    content: ''; position: absolute; inset: 0;
    background:
      radial-gradient(900px 620px at 18% 22%, rgba(37,99,235,0.30), transparent 62%),
      radial-gradient(760px 560px at 84% 82%, rgba(96,165,250,0.16), transparent 60%);
  }
  .card { position: relative; text-align: center; padding: 0 140px; }
  .rule {
    width: 64px; height: 4px; border-radius: 2px;
    background: ${BRAND}; margin: 0 auto 40px;
  }
  .eyebrow {
    font-size: 20px; letter-spacing: 0.26em; text-transform: uppercase;
    font-weight: 600; color: ${BRAND}; margin-bottom: 30px;
  }
  h1 {
    font-size: ${isEnd ? 76 : 88}px; line-height: 1.06; font-weight: 700;
    color: #fff; letter-spacing: -0.028em; margin-bottom: 28px;
  }
  p { font-size: 32px; color: ${MUTED}; font-weight: 400; line-height: 1.4; }
  .mark {
    position: absolute; bottom: 68px; left: 0; right: 0;
    font-size: 22px; letter-spacing: 0.2em; text-transform: uppercase;
    color: rgba(255,255,255,0.34); font-weight: 600; text-align: center;
  }
</style></head>
<body>
  <div class="card">
    <div class="rule"></div>
    <div class="eyebrow">${escapeHtml(eyebrow)}</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(subtitle)}</p>
  </div>
  <div class="mark">HBCField &nbsp;·&nbsp; hbcfield.com</div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/**
 * Both cards in one browser launch. Launching Chromium twice for two
 * screenshots costs about two seconds of an otherwise short assembly step.
 */
export async function renderCards(
  outDir: string,
  content: { title: string; subtitle: string },
): Promise<{ titleCard: string; endCard: string }> {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--force-color-profile=srgb'] });
  const page = await browser.newPage({
    viewport: { width: OUTPUT.width, height: OUTPUT.height },
    deviceScaleFactor: 1,
  });

  const shots: Array<[string, CardContent, 'title' | 'end']> = [
    ['title-card.png', { eyebrow: 'HBCField', title: content.title, subtitle: content.subtitle }, 'title'],
    [
      'end-card.png',
      { eyebrow: 'Try it', title: 'hbcfield.com', subtitle: 'Field service management that keeps its own records.' },
      'end',
    ],
  ];

  const written: string[] = [];
  for (const [name, card, variant] of shots) {
    await page.setContent(cardHtml(card, variant), { waitUntil: 'load' });
    // Let webfonts settle; a screenshot taken mid-swap catches the fallback.
    await page.evaluate(() => document.fonts.ready);
    const file = path.join(outDir, name);
    await page.screenshot({ path: file });
    written.push(file);
  }

  await browser.close();
  return { titleCard: written[0]!, endCard: written[1]! };
}
