'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'next-themes';
import { Sun, Moon, ShoppingBag } from 'lucide-react';
import { AnimatedLogo } from '@hbcfield/shared/components';
import { LanguageSwitcher } from '@/components/language-switcher';

const MONO = 'font-[family:var(--font-martian)]';

/**
 * Marketing navbar for pages OTHER than the home page (blog, industries, …).
 * Same look as the home navbar, but the on-page anchor links (#work, #how, …)
 * are replaced with route links — those sections only exist on home.
 * Render inside a `dark`-classed wrapper on dark marketing pages so the
 * foreground tokens resolve light.
 */
export function SiteNav({ active }: { active?: 'blog' | 'industries' }) {
  const { t } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const tone = (isActive?: boolean) =>
    `${MONO} text-[11px] uppercase tracking-[0.2em] transition-colors ${isActive ? 'text-foreground' : 'text-foreground/60 hover:text-foreground'}`;

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-40 px-6 transition-all duration-300 sm:px-10 ${
        scrolled ? 'border-b border-foreground/[0.08] bg-[#0e1116]/70 py-3 backdrop-blur-xl' : 'border-b border-transparent py-5'
      }`}
    >
      <div className="mx-auto flex max-w-[1600px] items-center justify-between">
        <Link href="/" aria-label={t('home.nav.home', 'Home')} className="inline-flex">
          <AnimatedLogo size="small" variant="light" />
        </Link>
        <div className="flex items-center gap-3 sm:gap-7">
          <Link href="/#pricing" className={`hidden md:block ${tone()}`}>{t('home.nav.pricing')}</Link>
          <Link href="/industries" className={`hidden sm:block ${tone(active === 'industries')}`}>{t('home.nav.industries')}</Link>
          <Link href="/blog" className={tone(active === 'blog')}>{t('home.nav.blog', 'Blog')}</Link>
          <a
            href="https://shop.hbcfield.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('home.nav.shop', 'Shop')}
            title={t('home.nav.shop', 'Shop')}
            className={`flex items-center ${tone()}`}
          >
            <ShoppingBag className="h-4 w-4 md:hidden" />
            <span className="hidden md:inline">{t('home.nav.shop', 'Shop')}</span>
          </a>
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            aria-label={t('home.nav.toggleTheme', 'Toggle theme')}
            className="inline-flex size-8 items-center justify-center rounded-full text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            {mounted && resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <span className="text-foreground/60">
            <LanguageSwitcher />
          </span>
          <Link
            href="/login"
            className={`${MONO} inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-foreground/25 px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-foreground/80 transition-colors hover:border-foreground/60 hover:text-foreground`}
          >
            {t('home.nav.signIn')}
          </Link>
        </div>
      </div>
    </nav>
  );
}
