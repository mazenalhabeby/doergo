'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'next-themes';
import { useAuth } from '@/contexts/auth-context';
import { usePrefersReducedMotion } from './use-reduced-motion';
import { useLenis } from './use-lenis';
import { scrollToHash } from './lenis-bus';
import { useScrollRestoration } from './use-scroll-restoration';
import { asArray } from './i18n-array';

/** HomeClient's state and handlers — everything before its markup, moved here unchanged. */
export function useHomeClient({ lang = 'en' }: Pick<{ lang?: string }, 'lang'>) {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const reduced = usePrefersReducedMotion();
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes: avoid hydration mismatch on the toggle icon (server can't know theme).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useLenis(!reduced);

  // The page is two documents — see use-scroll-restoration. `mounted` is the
  // commit in which the real prefers-reduced-motion value has been applied, so
  // it marks the point where the layout is the one the offset was measured in.
  useScrollRestoration(mounted);

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.push('/dashboard');
  }, [isLoading, isAuthenticated, router]);

  // Navbar gets a frosted background once you scroll off the hero, so the links
  // stay legible over content instead of floating on nothing.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // On-page nav links → smooth-scroll via Lenis (native anchor jumps aren't smooth).
  const navTo = (hash: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    scrollToHash(hash);
  };
  const backToTop = (e: React.MouseEvent) => {
    e.preventDefault();
    scrollToHash('#top', 0);
  };

  const steps = asArray<{ key: string; desc: string }>(t('home.process.steps', { returnObjects: true }));

  // Nav floats over the always-dark hero at the top (needs light chrome), then
  // frosts over theme-aware content once scrolled (needs theme-aware chrome).
  const navTone = scrolled ? 'text-foreground/60 hover:text-foreground' : 'text-white/55 hover:text-white';
  const navBtnTone = scrolled
    ? 'border-foreground/25 text-foreground/80 hover:border-foreground/50 hover:text-foreground'
    : 'border-white/20 text-white/80 hover:border-white/50 hover:text-white';
  const navLsTone = scrolled
    ? '[&_button]:!text-foreground/60 [&_button:hover]:!text-foreground [&_button]:hover:!bg-foreground/10'
    : '[&_button]:!text-white/60 [&_button:hover]:!text-white [&_button]:hover:!bg-white/10';

  return {
    t,
    reduced,
    resolvedTheme,
    setTheme,
    mounted,
    scrolled,
    navTo,
    backToTop,
    steps,
    navTone,
    navBtnTone,
    navLsTone,
  };
}

/** What HomeClient and its sections read. */
export type HomeClientState = ReturnType<typeof useHomeClient>;
