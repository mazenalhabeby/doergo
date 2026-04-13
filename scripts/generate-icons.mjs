/**
 * Generate mobile app icons from the HBCField arrow SVG design.
 *
 * Produces:
 *   - icon.png          (1024x1024) – iOS App Store / Expo icon
 *   - adaptive-icon.png (1024x1024) – Android adaptive icon foreground
 *   - splash.png        (1284x2778) – Solid dark bg (matches animated splash first frame)
 *   - favicon.png       (48x48)     – Web favicon
 *   - notification-icon.png (96x96) – White silhouette for notifications
 */

import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, '..', 'apps', 'mobile', 'assets');

const SPLASH_BG = '#09090b';

// ── Arrow SVG (color version, centered in viewBox) ──
function arrowSvg(size, padding = 0.2) {
  const inner = size - 2 * (size * padding);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="at" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#059669"/>
      <stop offset="100%" stop-color="#10b981"/>
    </linearGradient>
    <linearGradient id="ab" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#60a5fa"/>
    </linearGradient>
    <linearGradient id="ac" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#047857"/>
      <stop offset="100%" stop-color="#1e40af"/>
    </linearGradient>
  </defs>
  <g transform="translate(${size / 2},${size / 2}) scale(${inner / 48})">
    <polygon points="18,-2 -10,-20 -2,-2" fill="url(#at)"/>
    <polygon points="18,2 -10,20 -2,2" fill="url(#ab)"/>
    <polygon points="-2,-2 18,0 -2,2 -16,0" fill="url(#ac)" opacity="0.8"/>
    <polygon points="-10,-20 -16,0 -2,-2" fill="#047857" opacity="0.45"/>
    <polygon points="-10,20 -16,0 -2,2" fill="#1e3a8a" opacity="0.25"/>
  </g>
</svg>`;
}

// ── White silhouette arrow for notification icon ──
function arrowSvgWhite(size, padding = 0.2) {
  const inner = size - 2 * (size * padding);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g transform="translate(${size / 2},${size / 2}) scale(${inner / 48})">
    <polygon points="18,-2 -10,-20 -2,-2" fill="white"/>
    <polygon points="18,2 -10,20 -2,2" fill="white"/>
    <polygon points="-2,-2 18,0 -2,2 -16,0" fill="white" opacity="0.9"/>
    <polygon points="-10,-20 -16,0 -2,-2" fill="white" opacity="0.6"/>
    <polygon points="-10,20 -16,0 -2,2" fill="white" opacity="0.4"/>
  </g>
</svg>`;
}

async function generate() {
  console.log('Generating HBCField app icons...\n');

  // 1) icon.png (1024x1024) - dark bg with arrow + subtle glow
  const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs>
      <linearGradient id="ibg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#111827"/>
        <stop offset="50%" stop-color="#09090b"/>
        <stop offset="100%" stop-color="#0c1524"/>
      </linearGradient>
      <radialGradient id="iglow" cx="50%" cy="50%" r="40%">
        <stop offset="0%" stop-color="rgba(5,150,105,0.2)"/>
        <stop offset="100%" stop-color="transparent"/>
      </radialGradient>
      <linearGradient id="iat" x1="0" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stop-color="#059669"/>
        <stop offset="100%" stop-color="#10b981"/>
      </linearGradient>
      <linearGradient id="iab" x1="0" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stop-color="#3b82f6"/>
        <stop offset="100%" stop-color="#60a5fa"/>
      </linearGradient>
      <linearGradient id="iac" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#047857"/>
        <stop offset="100%" stop-color="#1e40af"/>
      </linearGradient>
    </defs>
    <rect width="1024" height="1024" rx="180" fill="url(#ibg)"/>
    <circle cx="512" cy="512" r="350" fill="url(#iglow)"/>
    <g transform="translate(512,512) scale(14)">
      <polygon points="18,-2 -10,-20 -2,-2" fill="url(#iat)"/>
      <polygon points="18,2 -10,20 -2,2" fill="url(#iab)"/>
      <polygon points="-2,-2 18,0 -2,2 -16,0" fill="url(#iac)" opacity="0.8"/>
      <polygon points="-10,-20 -16,0 -2,-2" fill="#047857" opacity="0.45"/>
      <polygon points="-10,20 -16,0 -2,2" fill="#1e3a8a" opacity="0.25"/>
    </g>
  </svg>`;
  await sharp(Buffer.from(iconSvg)).png().toFile(join(ASSETS, 'icon.png'));
  console.log('  ✓ icon.png (1024x1024)');

  // 2) adaptive-icon.png (1024x1024) - transparent bg, just the arrow
  const adaptiveSvg = arrowSvg(1024, 0.25);
  await sharp(Buffer.from(adaptiveSvg)).png().toFile(join(ASSETS, 'adaptive-icon.png'));
  console.log('  ✓ adaptive-icon.png (1024x1024)');

  // 3) splash.png (1284x2778) - SOLID dark background only
  //    This must match the animated splash's initial frame exactly.
  //    The AnimatedSplash component handles all visual content.
  const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1284" height="2778">
    <rect width="1284" height="2778" fill="${SPLASH_BG}"/>
  </svg>`;
  await sharp(Buffer.from(splashSvg)).png().toFile(join(ASSETS, 'splash.png'));
  console.log('  ✓ splash.png (1284x2778) — solid dark bg for seamless transition');

  // 4) favicon.png (48x48)
  const faviconSvg = arrowSvg(48, 0.1);
  await sharp(Buffer.from(faviconSvg)).png().toFile(join(ASSETS, 'favicon.png'));
  console.log('  ✓ favicon.png (48x48)');

  // 5) notification-icon.png (96x96) - white silhouette
  const notifSvg = arrowSvgWhite(96, 0.15);
  await sharp(Buffer.from(notifSvg)).png().toFile(join(ASSETS, 'notification-icon.png'));
  console.log('  ✓ notification-icon.png (96x96)');

  console.log(`\nDone! Splash bg: ${SPLASH_BG} (matches animated splash first frame)`);
}

generate().catch(console.error);
