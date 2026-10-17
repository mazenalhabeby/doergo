'use client';

import { ArrowUpRight, ArrowUp } from 'lucide-react';
import { AnimatedLogo } from '@hbcfield/shared/components';
import { StoreBadges } from './StoreBadges';
import { DISPLAY, MONO, FooterCol } from './home-client-helpers';
import type { HomeClientState } from './use-home-client';

/** Part of HomeClient's markup, moved here unchanged; it reads the page's state from `vm`. */
export function HomeClientFooter({ vm }: { vm: HomeClientState }) {
  const { t, navTo, backToTop } = vm;
  return (
    <footer className="relative overflow-hidden border-t border-foreground/[0.08] px-6 pt-20 sm:px-10">
      <div className="mx-auto max-w-[1600px]">
        {/* brand + links */}
        <div className="flex flex-col gap-14 lg:flex-row lg:justify-between lg:gap-12">
          {/* brand + contact */}
          <div className="max-w-sm">
            <AnimatedLogo size="small" variant="light" />
            <p className="mt-6 text-[15px] leading-relaxed text-foreground/45">
              {t('home.footer.tagline')}
            </p>
            <a
              href="mailto:office@hbcfield.com"
              className={`${MONO} group mt-7 inline-flex items-center gap-2 border-b border-foreground/25 pb-1 text-[12px] tracking-[0.12em] text-foreground/70 transition-colors hover:border-foreground hover:text-foreground`}
            >
              office@hbcfield.com
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </div>

          {/* link columns */}
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:gap-20">
            <FooterCol title={t('home.footer.explore')} links={[
              { label: t('home.footer.linkPlatform'), href: '#work', onClick: navTo('#work') },
              { label: t('home.footer.linkProcess'), href: '#how', onClick: navTo('#how') },
              { label: t('home.footer.linkApp'), href: '#field', onClick: navTo('#field') },
              { label: t('home.footer.linkPricing'), href: '#pricing', onClick: navTo('#pricing') },
              { label: t('home.footer.linkGetStarted'), href: '#contact', onClick: navTo('#contact') },
            ]} />
            <FooterCol title={t('home.footer.company')} links={[
              { label: t('home.footer.linkSignIn'), href: '/login' },
              { label: t('home.footer.linkHelp', 'Help Center'), href: '/help' },
              { label: t('home.footer.linkBlog', 'Blog'), href: '/blog' },
            ]} />
            <FooterCol title={t('home.footer.legal')} links={[
              { label: t('home.footer.linkPrivacy'), href: '/privacy' },
              { label: t('home.footer.linkTerms'), href: '/terms' },
            ]} />
          </div>
        </div>

        {/* oversized brand accent + app badges on one line */}
        <div className="mt-14 flex flex-wrap items-end justify-between gap-x-10 gap-y-8">
          <span
            aria-hidden
            className={`${DISPLAY} pointer-events-none select-none whitespace-nowrap text-[clamp(4rem,17vw,15rem)] font-normal leading-[0.78] tracking-[-0.04em] text-foreground/[0.045]`}>
            HBCField
          </span>
          <div className="shrink-0 pb-2">
            <div className={`${MONO} mb-3 text-[10px] uppercase tracking-[0.28em] text-foreground/30`}>{t('home.footer.linkGetApp')}</div>
            <StoreBadges />
          </div>
        </div>

        {/* bottom bar */}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-foreground/[0.06] py-8 sm:flex-row">
          <div className={`${MONO} text-[11px] uppercase tracking-[0.15em] text-foreground/30`}>
            © {new Date().getFullYear()} HBCField {t('home.footer.copyrightSuffix')}
          </div>
          <button
            type="button"
            onClick={backToTop}
            className={`${MONO} group inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-foreground/40 transition-colors hover:text-foreground`}
          >
            {t('home.footer.backToTop')}
            <ArrowUp className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
          </button>
        </div>
      </div>
    </footer>
  );
}
