import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire('/Users/pc/work/doergo/tools/video/package.json');
const { chromium } = require('@playwright/test');
const dir = process.cwd();
const fs = await import('node:fs');
const tl = JSON.parse(fs.readFileSync('timeline.json','utf8'));
// index.html = ad.html with the timeline baked in
fs.writeFileSync('index.html', fs.readFileSync('ad.html','utf8').replace('__TIMELINE__', JSON.stringify(tl)));
const FPS = 30, N = Math.round(tl.duration * FPS);
const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file://' + dir + '/index.html');
await page.evaluate(() => window.__ready);
if (only) {
  for (const t of only) { await page.evaluate(([t,f]) => render(t,f), [t, Math.round(t*FPS)]); await page.screenshot({ path: `still-${t}.jpg`, quality: 80, type: 'jpeg' }); }
} else {
  const ff = spawn('ffmpeg', ['-v','error','-y','-f','image2pipe','-framerate',String(FPS),'-i','-','-i','voice.wav',
    '-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-shortest','-movflags','+faststart','money-wide.mp4'], { stdio: ['pipe','inherit','inherit'] });
  for (let i = 0; i < N; i++) {
    await page.evaluate(([t,f]) => render(t,f), [i / FPS, i]);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 90 === 0) console.log('frame', i, '/', N);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
}
await browser.close();
