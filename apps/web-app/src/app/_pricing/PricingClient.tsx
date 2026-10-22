'use client';

import Link from 'next/link';
import { Sun, Moon } from 'lucide-react';
import { AnimatedLogo } from '@hbcfield/shared/components';
import { LanguageSwitcher } from '@/components/app-shell/language-switcher';
import { usePricingClient } from './use-pricing-client';
import { MONO, ACCENT } from './pricing-client-helpers';
import { PricingClientEyebrow } from './pricing-client-eyebrow';

/**
 * The full price of everything, on a page anybody can open.
 *
 * The home page answers "roughly what will this cost me?" in one number. This is
 * where somebody goes when that number matters — before a purchase, or to check
 * a quote against the list. So nothing is summarised away: every module, every
 * add-on, every band of every ladder, and the rules that decide when a change
 * reaches the bill.
 *
 * It is deliberately outside the authenticated app. A price you have to sign up
 * to see is a price people assume is bad.
 */
export default function PricingClient() {
  const vm = usePricingClient();
  const { t, resolvedTheme, setTheme } = vm;

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* ── nav ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 border-b border-border bg-background/80 px-6 py-3 backdrop-blur-xl sm:px-10">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4">
          {/* The logo IS the way back. A back arrow beside it says the same
              thing twice and reads like browser chrome bolted onto the page. */}
          <Link href="/" className="inline-flex items-center" aria-label={t('home.nav.home', 'Home')}>
            <AnimatedLogo size="small" />
          </Link>
          <div className="flex items-center gap-1 sm:gap-3">
            <button
              type="button"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              aria-label={t('home.nav.toggleTheme', 'Toggle theme')}
              className={"inline-flex size-8 items-center justify-center rounded-full " +
                "text-foreground/50 transition-colors hover:bg-foreground/10 " +
                "hover:text-foreground"}
            >
              {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <LanguageSwitcher />
            <Link
              href="/login?mode=register"
              className={(`${MONO} inline-flex shrink-0 items-center whitespace-nowrap ` +
                `rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.2em] ` +
                `text-[#04121f] transition-opacity hover:opacity-90`)}
              style={{ backgroundColor: ACCENT }}
            >
              {t('pricing.startTrial', 'Start free')}
            </Link>
          </div>
        </div>
      </nav>

      <PricingClientEyebrow vm={vm} />
    </main>
  );
}
