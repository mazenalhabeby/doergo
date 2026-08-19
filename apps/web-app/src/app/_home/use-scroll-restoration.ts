'use client';

import { useEffect, useRef } from 'react';

import { scrollToOffset } from './lenis-bus';

/**
 * Keeps your place across a reload on a page whose height changes after mount.
 *
 * The landing page is two documents. `prefers-reduced-motion` cannot be read on
 * the server, so the first paint renders the reduced-motion layout — short,
 * static sections — and the real value only arrives in an effect. The page then
 * grows from a few thousand pixels to about nineteen thousand as the
 * scroll-choreographed sections take their `270vh`.
 *
 * The browser restores scroll BEFORE that, against the short document. It
 * clamps or lands somewhere arbitrary, the page grows underneath it, and you
 * end up parked inside a sticky section with its entrance animation frozen
 * part-way — because those animations derive their state from scroll position,
 * and the position no longer means what it did. That is the "reload and get a
 * strange screen" report.
 *
 * So: take restoration off the browser, remember the offset ourselves, and put
 * it back once the layout has settled. Same place, correct animation state.
 */
const KEY = 'hbcfield:home-scroll';

export function useScrollRestoration(settled: boolean) {
  const restored = useRef(false);
  // Read ONCE, synchronously, before anything can scroll: the page loads at 0
  // and Lenis emits a scroll tick immediately, so a listener attached first
  // would overwrite the stored offset with 0 and there would be nothing to
  // restore. (It did, and there wasn't.)
  const savedRef = useRef<number | null>(null);
  if (savedRef.current === null && typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(KEY);
      savedRef.current = raw ? Number(raw) : 0;
    } catch {
      savedRef.current = 0;
    }
  }

  // Take over restoration immediately — before the browser gets to do its own.
  useEffect(() => {
    if (!('scrollRestoration' in history)) return;
    const previous = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    return () => {
      history.scrollRestoration = previous;
    };
  }, []);

  // Put the offset back once the real layout exists. Two frames: one for the
  // branch swap to commit, one for the tall sections to have their height.
  useEffect(() => {
    if (!settled || restored.current) return;
    restored.current = true;

    const saved = savedRef.current ?? 0;
    // A fresh visit, or an anchor the browser is already handling: leave it be.
    if (!saved || Number.isNaN(saved) || saved <= 0 || window.location.hash) return;

    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        // Never scroll past a document that ended up shorter than expected.
        const max = document.documentElement.scrollHeight - window.innerHeight;
        // Through the Lenis-aware helper: Lenis keeps its own scroll value and
        // can revert a bare window.scrollTo on its next tick.
        scrollToOffset(Math.min(saved, Math.max(0, max)));
      }),
    );
    return () => cancelAnimationFrame(id);
  }, [settled]);

  // Only start recording AFTER the restore has been attempted, for the same
  // reason: an early tick at 0 would erase where the reader actually was.
  useEffect(() => {
    if (!settled) return;
    let queued = false;
    const save = () => {
      queued = false;
      try {
        sessionStorage.setItem(KEY, String(Math.round(window.scrollY)));
      } catch {
        // Private mode / storage disabled — losing the position is acceptable.
      }
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(save);
    };
    // Give the restore its two frames before the first write can land.
    const arm = setTimeout(() => {
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('pagehide', save);
    }, 250);
    return () => {
      clearTimeout(arm);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', save);
    };
  }, [settled]);
}
