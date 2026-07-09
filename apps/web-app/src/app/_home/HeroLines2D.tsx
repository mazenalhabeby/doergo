'use client';

/**
 * Hero background: THREE faint long lines. When the cursor touches a line, a
 * bright blue jagged LIGHTNING bolt crackles from that line across to the
 * nearest other line — the trionn "touch the lines" electric effect (studied
 * frame-by-frame from the reference).
 *
 * Plain 2D canvas — coexists with the gem's WebGL canvas (a second *WebGL*
 * context breaks the transmission gem; a 2D canvas does not). Pauses when
 * hidden; static (no bolts) for reduced-motion.
 */

import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from './use-reduced-motion';

type Pt = { x: number; y: number };
type Line = { pts: Pt[] };

export function HeroLines2D({ active = true }: { active?: boolean }) {
  const reduced = usePrefersReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  const startRef = useRef<() => void>(() => {});
  activeRef.current = active;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0;
    let lines: Line[] = [];
    const mouse = { x: -9999, y: -9999 };
    const SAMPLES = 50;
    const TOUCH = 14;         // px: the cursor must actually be ON a line to spark
    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    // three long, faint lines fanning through a hub behind the gem
    const build = () => {
      lines = [];
      const hub: Pt = { x: W * 0.5, y: H * 0.5 };
      const diag = Math.hypot(W, H);
      const angles = [rand(-0.35, -0.15), rand(0.12, 0.32), rand(1.35, 1.75)]; // 3 distinct sweeps
      for (const ang of angles) {
        const perp: Pt = { x: -Math.sin(ang), y: Math.cos(ang) };
        const off = rand(-0.22, 0.22) * Math.min(W, H);
        const px = hub.x + perp.x * off;
        const py = hub.y + perp.y * off;
        const dir: Pt = { x: Math.cos(ang), y: Math.sin(ang) };
        const bend = rand(-14, 14);
        const pts: Pt[] = [];
        for (let s = 0; s <= SAMPLES; s++) {
          const t = s / SAMPLES;
          const along = (t - 0.5) * 2 * diag;
          const bow = Math.sin(t * Math.PI) * bend;
          pts.push({ x: px + dir.x * along + perp.x * bow, y: py + dir.y * along + perp.y * bow });
        }
        lines.push({ pts });
      }
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    };
    resize();
    window.addEventListener('resize', resize);

    const onMove = (e: PointerEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; startRef.current(); };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerout', onLeave, { passive: true });

    // nearest point on a line to (px,py)
    const nearestOn = (line: Line, px: number, py: number) => {
      let best = Infinity; let bp = line.pts[0];
      for (const p of line.pts) {
        const d = (p.x - px) ** 2 + (p.y - py) ** 2;
        if (d < best) { best = d; bp = p; }
      }
      return { pt: bp, dist: Math.sqrt(best) };
    };

    const trace = (pts: Pt[]) => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    };

    // a jagged lightning path from a to b (with a little fork), drawn as a wide
    // blue glow halo + a white-hot core — bright and electric like the reference.
    const bolt = (a: Pt, b: Pt) => {
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const segs = Math.max(6, Math.round(dist / 26));
      const nx = -(b.y - a.y), ny = b.x - a.x;
      const nlen = Math.hypot(nx, ny) || 1;
      const spread = Math.min(48, dist * 0.35);
      const pts: Pt[] = [a];
      for (let i = 1; i < segs; i++) {
        const t = i / segs;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        const jag = (Math.random() - 0.5) * spread * Math.sin(t * Math.PI);
        pts.push({ x: x + (nx / nlen) * jag, y: y + (ny / nlen) * jag });
      }
      pts.push(b);

      // glow halo
      trace(pts);
      ctx.strokeStyle = 'rgba(70, 150, 255, 0.32)';
      ctx.lineWidth = 5;
      ctx.shadowColor = 'rgba(90, 170, 255, 1)';
      ctx.shadowBlur = 20;
      ctx.stroke();
      // white-hot core
      trace(pts);
      ctx.strokeStyle = 'rgba(232, 242, 255, 0.98)';
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // a couple of short forks off the middle
      for (let k = 0; k < 2; k++) {
        const i = 2 + Math.floor(Math.random() * Math.max(1, pts.length - 4));
        const p = pts[i];
        const fork: Pt[] = [p];
        const fsteps = 3;
        let fx = p.x, fy = p.y;
        const dirx = (Math.random() - 0.5), diry = (Math.random() - 0.5);
        for (let s = 0; s < fsteps; s++) {
          fx += dirx * 26 + (Math.random() - 0.5) * 20;
          fy += diry * 26 + (Math.random() - 0.5) * 20;
          fork.push({ x: fx, y: fy });
        }
        trace(fork);
        ctx.strokeStyle = 'rgba(150, 200, 255, 0.7)';
        ctx.lineWidth = 1;
        ctx.shadowColor = 'rgba(90, 170, 255, 0.9)';
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    };

    // Draws a frame; returns true if the cursor is near a line (i.e. actively
    // sparking) so the animation loop knows whether it still needs to run.
    const drawFrame = (spark: boolean): boolean => {
      ctx.clearRect(0, 0, W, H);

      // faint base lines
      for (const line of lines) {
        ctx.beginPath();
        line.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.strokeStyle = 'rgba(200, 214, 230, 0.10)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      if (!spark || mouse.x < -1000) return false;

      // which lines is the cursor near?
      const ranked = lines
        .map((l) => ({ l, ...nearestOn(l, mouse.x, mouse.y) }))
        .sort((a, b) => a.dist - b.dist);

      const near = ranked[0].dist < TOUCH;
      if (near) {
        ctx.globalCompositeOperation = 'lighter';
        // spark originates exactly where the cursor touches the line
        const a: Pt = { x: mouse.x, y: mouse.y };
        // arc from the touch point to EVERY other line → a little network
        for (let i = 1; i < ranked.length; i++) bolt(a, ranked[i].pt);
        // bright flare at the touch point
        const g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, 16);
        g.addColorStop(0, 'rgba(220,236,255,0.95)');
        g.addColorStop(0.4, 'rgba(120,180,255,0.5)');
        g.addColorStop(1, 'rgba(120,180,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(a.x, a.y, 16, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      return near;
    };

    if (reduced) {
      drawFrame(false);
      return () => { window.removeEventListener('resize', resize); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerout', onLeave); };
    }

    let raf = 0;
    let running = false;
    const frame = () => {
      // spark every frame while near a line; the random jag itself flickers
      const near = drawFrame(true);
      // Keep the 60fps loop alive ONLY while the cursor is actually near a line and
      // the hero is on-screen/visible. Otherwise idle — redrawing three static
      // faint lines every frame is pure waste. A pointermove re-arms it via start().
      if (near && activeRef.current && document.visibilityState === 'visible') {
        raf = requestAnimationFrame(frame);
      } else {
        running = false;
        drawFrame(false); // settle to the static lines
      }
    };
    const start = () => {
      if (!running && activeRef.current && document.visibilityState === 'visible') {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    };
    startRef.current = start;
    start();
    // draw one static frame immediately so the lines are visible even while paused
    drawFrame(false);

    const onVis = () => { start(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerout', onLeave);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [reduced]);

  // start/stop the loop as the hero scrolls in and out of view
  useEffect(() => {
    if (active) startRef.current();
    // when inactive, the running loop self-stops on its next frame check
  }, [active]);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}
