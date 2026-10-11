// node render.mjs [en|de] [t1,t2,…]   → stills at those seconds, or the whole film with its voice
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const require = createRequire('/Users/pc/work/doergo/tools/video/package.json');
const { chromium } = require('@playwright/test');
const lang = process.argv[2] || 'en', W = lang === 'en' ? '' : `-${lang}`;
const tl = JSON.parse(fs.readFileSync(`timeline${W}.json`, 'utf8'));
fs.writeFileSync(`index${W}.html`, fs.readFileSync('film.html', 'utf8').replace('__TIMELINE__', JSON.stringify(tl)));
const FPS = 30, N = Math.round(tl.duration * FPS);
const only = process.argv[3] ? process.argv[3].split(',').map(Number) : null;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', e => console.error('PAGE ERROR', e.message));
await page.goto('file://' + process.cwd() + `/index${W}.html`);
await page.evaluate(() => window.__ready);
if (only) {
  fs.mkdirSync('stills', { recursive: true });
  for (const t of only) { await page.evaluate(t => render(t), t); await page.screenshot({ path: `stills/${lang}-${t}.jpg`, quality: 80, type: 'jpeg' }); }
} else {
  const out = `long-task-compare${W}.mp4`;
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-i', `voice${W}.wav`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < N; i++) {
    await page.evaluate(t => render(t), i / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 300 === 0) console.log('frame', i, '/', N);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  console.log('DONE', out);
}
await browser.close();
