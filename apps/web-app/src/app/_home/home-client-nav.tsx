'use client';

import Link from 'next/link';
import { Sun, Moon, ShoppingBag } from 'lucide-react';
import { AnimatedLogo } from '@hbcfield/shared/components';
import { LanguageSwitcher } from '@/components/app-shell/language-switcher';
import { MONO } from './home-client-helpers';
import type { HomeClientState } from './use-home-client';

/** Part of HomeClient's markup, moved here unchanged; it reads the page's state from `vm`. */
export function HomeClientNav({ vm }: { vm: HomeClientState }) {
  const {
    scrolled,
    backToTop,
    t,
    navTo,
    navTone,
    setTheme,
    resolvedTheme,
    mounted,
    navLsTone,
    navBtnTone,
  } = vm;
  return (
    <nav
      className={`fixed inset-x-0 top-0 z-40 px-6 transition-all duration-300 sm:px-10 ${scrolled
        ? 'border-b border-border bg-background/70 py-3 backdrop-blur-xl'
        : 'border-b border-transparent py-5'}`}>
      <div className="mx-auto flex max-w-[1600px] items-center justify-between">
        {/* Logo → back to the top of home. Over the dark hero it must read
            light in both themes; once scrolled over content it follows the
            theme (dark logo on light). */}
        <a href="#top" onClick={backToTop} aria-label={t('home.nav.home', 'Home')} className="inline-flex">
          {scrolled ? (
            <>
              <span className="dark:hidden"><AnimatedLogo size="small" variant="dark" /></span>
              <span className="hidden dark:block"><AnimatedLogo size="small" variant="light" /></span>
            </>
          ) : (
            <AnimatedLogo size="small" variant="light" />
          )}
        </a>
        <div className="flex items-center gap-3 sm:gap-7">
          <a
            href="#work"
            onClick={navTo('#work')}
            className={`${MONO} hidden text-[11px] uppercase tracking-[0.2em] transition-colors md:block ${navTone}`}>{t(
              'home.nav.platform')}</a>
          <a
            href="#how"
            onClick={navTo('#how')}
            className={`${MONO} hidden text-[11px] uppercase tracking-[0.2em] transition-colors md:block ${navTone}`}>{t(
              'home.nav.process')}</a>
          <a
            href="#field"
            onClick={navTo('#field')}
            className={`${MONO} hidden text-[11px] uppercase tracking-[0.2em] transition-colors sm:block ${navTone}`}>{t(
              'home.nav.app')}</a>
          <a
            href="#industries"
            onClick={navTo('#industries')}
            className={`${MONO} hidden text-[11px] uppercase tracking-[0.2em] transition-colors md:block ${navTone}`}>{t(
              'home.nav.industries')}</a>
          <a
            href="#pricing"
            onClick={navTo('#pricing')}
            className={`${MONO} hidden text-[11px] uppercase tracking-[0.2em] transition-colors md:block ${navTone}`}>{t(
              'home.nav.pricing')}</a>
          <a
            href="#features"
            onClick={navTo('#features')}
            className={`${MONO} hidden text-[11px] uppercase tracking-[0.2em] transition-colors lg:block ${navTone}`}>{t(
              'home.nav.compare',
              'Compare')}</a>
          <Link
            href="/blog"
            className={`${MONO} hidden text-[11px] uppercase tracking-[0.2em] transition-colors md:block ${navTone}`}>{t(
              'home.nav.blog',
              'Blog')}</Link>
          {/* Shop — external storefront. Stays visible on mobile (no `hidden`)
              unlike the on-page anchors; word on larger screens, icon on small. */}
          <a
            href="https://shop.hbcfield.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('home.nav.shop', 'Shop')}
            title={t('home.nav.shop', 'Shop')}
            className={`${MONO} flex items-center text-[11px] uppercase tracking-[0.2em] transition-colors ${navTone}`}>
            <ShoppingBag className="h-4 w-4 md:hidden" />
            <span className="hidden md:inline">{t('home.nav.shop', 'Shop')}</span>
          </a>
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            aria-label={t('home.nav.toggleTheme', 'Toggle theme')}
            className={`inline-flex size-8 items-center justify-center rounded-full transition-colors ${navTone} ${scrolled
              ? 'hover:bg-foreground/10'
              : 'hover:bg-white/10'}`}
          >
            {mounted && resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <span className={navLsTone}>
            <LanguageSwitcher />
          </span>
          <Link
            href="/login"
            className={(`${MONO} inline-flex shrink-0 items-center gap-2 whitespace-nowrap ` +
              `rounded-full border px-4 py-2 text-[11px] uppercase tracking-[0.2em] ` +
              `transition-colors ${navBtnTone}`)}>
            {t('home.nav.signIn')}
          </Link>
        </div>
      </div>
    </nav>
  );
}
