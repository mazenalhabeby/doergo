// Render one ad: run from its folder.  node ../render.mjs            → <dir>-silent.mp4 + sfx.json
//                                      node ../render.mjs 3.2,10.5   → still-3.2.jpg, still-10.5.jpg
// ad.html must define render(t, frame), window.__ready (a promise) and may define window.SFX = [{t, s, v}].
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire('/Users/pc/work/doergo/tools/video/package.json');
const { chromium } = require('@playwright/test');
const dir = process.cwd(), name = path.basename(dir);
const tl = JSON.parse(fs.readFileSync('timeline.json', 'utf8'));
fs.writeFileSync('index.html', fs.readFileSync('ad.html', 'utf8').replace('__TIMELINE__', JSON.stringify(tl)));
const W = Number(process.env.W || 1080), H = Number(process.env.H || 1920), FPS = 30, N = Math.round(tl.duration * FPS);
const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('file://' + dir + '/index.html');
await page.evaluate(() => window.__ready);
fs.writeFileSync('sfx.json', JSON.stringify(await page.evaluate(() => window.SFX || []), null, 1));
if (only) {
  for (const t of only) {
    await page.evaluate(([t, f]) => render(t, f), [t, Math.round(t * FPS)]);
    await page.screenshot({ path: `still-${t}.jpg`, quality: 80, type: 'jpeg' });
  }
} else {
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${name}${W > H ? '-wide' : ''}-silent.mp4`],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < N; i++) {
    await page.evaluate(([t, f]) => render(t, f), [i / FPS, i]);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(name, 'frame', i, '/', N);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
}
if (errs.length) console.error('PAGE ERRORS:\n' + errs.join('\n'));
await browser.close();
