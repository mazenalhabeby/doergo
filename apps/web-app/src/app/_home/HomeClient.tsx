'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'next-themes';
import { ArrowRight, ArrowDown, ArrowUpRight, ArrowUp, Check, Zap, Sun, Moon, ShoppingBag } from 'lucide-react';
import { AnimatedLogo } from '@hbcfield/shared/components';
import { orgMonthlyCost, formatCents } from '@hbcfield/shared/client';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useAuth } from '@/contexts/auth-context';
import { HeroCanvas } from './HeroCanvas';
import { IntroVideo } from './IntroVideo';
import { LaptopShowcase } from './LaptopShowcase';
import { PhoneShowcase } from './PhoneShowcase';
import { StoreBadges } from './StoreBadges';
import { FeatureMatrix } from './FeatureMatrix';
import { PricingEstimator } from './PricingEstimator';
import { usePrefersReducedMotion } from './use-reduced-motion';
import { useLenis } from './use-lenis';
import { scrollToHash } from './lenis-bus';
import { useReveal } from './use-reveal';
import { useScrollRestoration } from './use-scroll-restoration';
import { asArray } from './i18n-array';
import { INDUSTRY_SLUGS, industryPath, industriesHubPath } from '@/lib/industries';

/* ═══════════════════════════════════════════════════════════
   Monochrome studio palette
   bg #0e1116 · text #d8d8d8 · emphasis #f2f2f0 · hairline white/8
   display: Familjen Grotesk (400) · labels: Martian Mono
   ═══════════════════════════════════════════════════════════ */

/**
 * What the stack on the left actually costs here, per person.
 *
 * Hard-coded once as "from €29 / user" — a tier price — and it outlived the
 * tiers by a month, quoting a number the product could no longer charge. It is
 * computed now, from the same function the invoice is built from, against the
 * same set of capabilities the three subscriptions beside it replace: a team of
 * six running GPS, clock-in and signed reports. Six because it is a real small
 * firm rather than a flattering one — the per-person price only improves from
 * there.
 */
const FIELD_STACK_TEAM = 6;
const FIELD_STACK_PER_PERSON = Math.round(
  orgMonthlyCost({
    seatCount: FIELD_STACK_TEAM,
    spaces: [
      {
        spaceId: 'compare',
        spaceName: 'compare',
        enabledModules: ['checklists', 'attachments', 'tracking', 'time_tracking', 'service_reports'],
        usage: {},
      },
    ],
    addOns: [],
  }).monthlyCents / FIELD_STACK_TEAM,
);

const DISPLAY = 'font-[family:var(--font-familjen)]';
const MONO = 'font-[family:var(--font-martian)]';

/** Fade + rise reveal (progressive enhancement, always ends visible). */
function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}s` }}>
      {children}
    </div>
  );
}

/** Masked line-rise reveal — each line slides up from behind a clip (the
 *  studio-grade headline effect). Lines are explicit strings. */
function LineReveal({ lines, className = '', delayStep = 0.08, nowrap = false }: { lines: string[]; className?: string; delayStep?: number; nowrap?: boolean }) {
  const ref = useReveal<HTMLSpanElement>();
  return (
    <span ref={ref} className={`lr ${className}`}>
      {lines.map((l, i) => (
        <span key={i} className="lr-row">
          <span className={`lr-in ${nowrap ? 'whitespace-nowrap' : ''}`} style={{ transitionDelay: `${i * delayStep}s` }}>
            {l}
          </span>
        </span>
      ))}
    </span>
  );
}

/** Mono count-up with a wall-clock fallback (never stuck at 0). */
function Count({ to }: { to: number }) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) { setN(to); return; }
    let raf = 0;
    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      let start = 0;
      const dur = 1200;
      const tick = (t: number) => {
        if (!start) start = t;
        const p = Math.min(1, (t - start) / dur);
        setN(Math.round((1 - Math.pow(1 - p, 3)) * to));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { run(); io.disconnect(); } }, { threshold: 0.5 });
    io.observe(el);
    const fb = setTimeout(() => setN(to), 1600);
    return () => { cancelAnimationFrame(raf); clearTimeout(fb); io.disconnect(); };
  }, [reduced, to]);
  return <span ref={ref} className="tabular-nums">{n}</span>;
}

function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`${MONO} text-[11px] uppercase tracking-[0.28em] text-muted-foreground ${className}`}>{children}</span>;
}

/** Cycles through `words`, revealing each new word letter-by-letter from behind
 *  a clip — the trionn headline treatment. Reduced-motion shows the first word. */
function CyclingWord({ words, className = '' }: { words: string[]; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setI((v) => (v + 1) % words.length), 2600);
    return () => clearInterval(id);
  }, [reduced, words.length]);
  const word = words[i];
  return (
    <span className={`inline-flex ${className}`} aria-label={word}>
      {word.split('').map((ch, idx) => (
        <span key={`${i}-${idx}`} className="cw-row" aria-hidden>
          <span className="cw-in" style={{ animationDelay: `${idx * 0.035}s` }}>{ch}</span>
        </span>
      ))}
    </span>
  );
}

export default function HomeClient({ lang = 'en' }: { lang?: string }) {
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

  return (
    <>
      <style>{`
        .reveal { opacity: 0; transform: translateY(20px); transition: opacity .8s cubic-bezier(.22,1,.36,1), transform .8s cubic-bezier(.22,1,.36,1); }
        .reveal.is-visible { opacity: 1; transform: none; }
        .lr-row { display: block; overflow: hidden; }
        .lr-in { display: block; transform: translateY(110%); transition: transform .95s cubic-bezier(.22,1,.36,1); }
        .lr.is-visible .lr-in { transform: translateY(0); }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        /* cycling word — each letter rises from behind a clip (trionn-style) */
        /* padding-bottom + equal negative margin extends the clip area below the
           baseline so descenders (g, y, p, q, j) aren't cut, without shifting layout */
        .cw-row { display: inline-block; overflow: hidden; vertical-align: bottom; padding-bottom: 0.2em; margin-bottom: -0.2em; }
        .cw-in { display: inline-block; transform: translateY(110%); animation: cw-rise .6s cubic-bezier(.22,1,.36,1) forwards; }
        @keyframes cw-rise { to { transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) {
          .reveal { opacity: 1; transform: none; transition: none; }
          .lr-in { transform: none; transition: none; }
          .cw-in { transform: none; animation: none; }
        }
      `}</style>
      <noscript><style>{`.reveal{opacity:1!important;transform:none!important}.lr-in{transform:none!important}`}</style></noscript>

      {/* Marketing content is ALWAYS rendered (server-side too) so crawlers and
          AI engines receive the full page — not a spinner. Authenticated users
          are redirected to /dashboard by the effect above, over the top. */}
      <div className={`min-h-screen bg-background text-foreground antialiased selection:bg-foreground/20 ${DISPLAY}`}>
          {/* corner registration marks (fixed frame) */}
          <FramePlus />

          {/* ══════ NAV ══════ */}
          <nav className={`fixed inset-x-0 top-0 z-40 px-6 transition-all duration-300 sm:px-10 ${scrolled ? 'border-b border-border bg-background/70 py-3 backdrop-blur-xl' : 'border-b border-transparent py-5'}`}>
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
                <a href="#work" onClick={navTo('#work')} className={`${MONO} hidden text-[11px] uppercase tracking-[0.2em] transition-colors md:block ${navTone}`}>{t('home.nav.platform')}</a>
                <a href="#how" onClick={navTo('#how')} className={`${MONO} hidden text-[11px] uppercase tracking-[0.2em] transition-colors md:block ${navTone}`}>{t('home.nav.process')}</a>
                <a href="#field" onClick={navTo('#field')} className={`${MONO} hidden text-[11px] uppercase tracking-[0.2em] transition-colors sm:block ${navTone}`}>{t('home.nav.app')}</a>
                <a href="#industries" onClick={navTo('#industries')} className={`${MONO} hidden text-[11px] uppercase tracking-[0.2em] transition-colors md:block ${navTone}`}>{t('home.nav.industries')}</a>
                <a href="#pricing" onClick={navTo('#pricing')} className={`${MONO} hidden text-[11px] uppercase tracking-[0.2em] transition-colors md:block ${navTone}`}>{t('home.nav.pricing')}</a>
                <a href="#features" onClick={navTo('#features')} className={`${MONO} hidden text-[11px] uppercase tracking-[0.2em] transition-colors lg:block ${navTone}`}>{t('home.nav.compare', 'Compare')}</a>
                <Link href="/blog" className={`${MONO} hidden text-[11px] uppercase tracking-[0.2em] transition-colors md:block ${navTone}`}>{t('home.nav.blog', 'Blog')}</Link>
                {/* Shop — external storefront. Stays visible on mobile (no `hidden`)
                    unlike the on-page anchors; word on larger screens, icon on small. */}
                <a href="https://shop.hbcfield.com" target="_blank" rel="noopener noreferrer" aria-label={t('home.nav.shop', 'Shop')} title={t('home.nav.shop', 'Shop')} className={`${MONO} flex items-center text-[11px] uppercase tracking-[0.2em] transition-colors ${navTone}`}>
                  <ShoppingBag className="h-4 w-4 md:hidden" />
                  <span className="hidden md:inline">{t('home.nav.shop', 'Shop')}</span>
                </a>
                <button
                  type="button"
                  onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                  aria-label={t('home.nav.toggleTheme', 'Toggle theme')}
                  className={`inline-flex size-8 items-center justify-center rounded-full transition-colors ${navTone} ${scrolled ? 'hover:bg-foreground/10' : 'hover:bg-white/10'}`}
                >
                  {mounted && resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                <span className={navLsTone}>
                  <LanguageSwitcher />
                </span>
                <Link href="/login" className={`${MONO} inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-[11px] uppercase tracking-[0.2em] transition-colors ${navBtnTone}`}>
                  {t('home.nav.signIn')}
                </Link>
              </div>
            </div>
          </nav>

          {/* ══════ HERO — always dark (explicit bg so the page theme never lightens it) ══════ */}
          <section id="top" className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-[#0e1116] px-6 text-[#d8d8d8] sm:px-10">
            {/* the logo, rebuilt as an interactive 3D faceted gemstone / crystal mark, is the centrepiece */}
            <div className="absolute inset-0"><HeroCanvas interactive={!reduced} /></div>

            {/* headline top-left with a cycling last word (trionn treatment) */}
            <div className="pointer-events-none absolute left-6 top-28 sm:left-10 sm:top-32">
              <Reveal>
                <h1 className={`${DISPLAY} text-[clamp(2.4rem,6.5vw,5.5rem)] font-normal leading-[0.96] tracking-[-0.02em] text-[#efefec]`}>
                  {t('home.hero.line1')}<br />
                  {t('home.hero.under')}{' '}
                  <CyclingWord words={asArray<string>(t('home.hero.words', { returnObjects: true }))} className="align-baseline" />.
                </h1>
              </Reveal>
              {/* desktop/tablet: CTA sits under the headline. On mobile it moves to the bottom-right (below) */}
              <Reveal delay={0.15} className="pointer-events-auto mt-8 hidden sm:block">
                <Link href="/login?mode=register" className={`${MONO} group inline-flex items-center gap-3 border-b border-white/25 pb-1 text-[12px] uppercase tracking-[0.22em] text-white/80 transition-colors hover:border-white hover:text-white`}>
                  {t('home.hero.requestDemo')}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </Link>
                <StoreBadges size="sm" className="mt-7" />
              </Reveal>
            </div>

            {/* mobile-only CTA — pinned bottom-right, balancing the scroll cue on the left */}
            <div className="pointer-events-none absolute inset-x-6 bottom-8 flex justify-end sm:hidden">
              <Link href="/login?mode=register" className={`${MONO} group pointer-events-auto inline-flex items-center gap-2.5 whitespace-nowrap border-b border-white/25 pb-1 text-[11px] uppercase tracking-[0.18em] text-white/80 transition-colors hover:border-white hover:text-white`}>
                {t('home.hero.requestDemo')}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            {/* scroll cue */}
            <div className="pointer-events-none absolute bottom-8 left-6 flex items-center gap-3 sm:left-10">
              <ArrowDown className="h-4 w-4 animate-bounce text-white/40" />
              <span className={`${MONO} text-[11px] uppercase tracking-[0.28em] text-white/40`}>{t('home.hero.scroll')}</span>
            </div>

            {/* interaction hint — electric + product ("the field" = electric field) */}
            <div className="pointer-events-none absolute bottom-8 left-1/2 hidden -translate-x-1/2 items-center gap-2 md:flex">
              <Zap className="h-3.5 w-3.5 text-[#5B9BD5]" />
              <span className={`${MONO} text-[11px] uppercase tracking-[0.28em] text-white/40`}>{t('home.hero.hint')}</span>
            </div>

            {/* meta block — hidden on mobile (it collided with the scroll cue and clipped off-screen) */}
            <div className="pointer-events-none absolute bottom-8 right-6 hidden max-w-[16rem] text-right sm:right-10 md:block">
              <div className={`${MONO} text-[11px] uppercase tracking-[0.2em] text-white/50`}>{t('home.hero.meta')}</div>
              <p className="mt-2 text-[13px] leading-relaxed text-white/40">{t('home.hero.metaDesc')}</p>
            </div>
          </section>

          {/* ══════ POSITIONING ══════ */}
          <section className="border-t border-foreground/[0.08] px-6 py-20 sm:px-10 sm:py-40">
            <div className="mx-auto max-w-[1600px]">
              <Label className="mb-10 block">{t('home.whatItIs.label')}</Label>
              <h2 className={`${DISPLAY} text-[clamp(1.7rem,4vw,3.4rem)] font-normal leading-[1.08] tracking-[-0.01em] text-foreground`}>
                <LineReveal
                  nowrap
                  lines={asArray<string>(t('home.whatItIs.lines', { returnObjects: true }))}
                />
              </h2>
            </div>
          </section>

          {/* ══════ INTRO VIDEO ══════ */}
          <section className="border-t border-foreground/[0.08] px-6 py-16 sm:px-10 sm:py-32">
            <div className="mx-auto max-w-[1600px]">
              <Reveal>
                <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
                  <div>
                    <Label className="mb-6 block">{t('home.video.label')}</Label>
                    <h2 className={`${DISPLAY} max-w-[16ch] text-[clamp(1.8rem,4.4vw,3.4rem)] font-normal leading-[1.03] tracking-[-0.01em] text-foreground`}>
                      {t('home.video.title')}
                    </h2>
                  </div>
                  <p className="max-w-[36ch] text-[13px] leading-relaxed text-foreground/45">
                    {t('home.video.desc')}
                  </p>
                </div>
              </Reveal>
              <Reveal delay={0.1}>
                <div className="mx-auto max-w-[1120px]">
                  <IntroVideo />
                </div>
              </Reveal>
            </div>
          </section>

          {/* ══════ KEY FACTS ══════ */}
          <section className="border-t border-foreground/[0.08] px-6 py-16 sm:px-10 sm:py-24">
            <div className="mx-auto grid max-w-[1600px] gap-10 sm:gap-16 sm:grid-cols-3">
              {(() => {
                const facts = asArray<{ unit: string; label: string; desc: string }>(t('home.facts', { returnObjects: true }));
                return [
                  { v: <><Count to={25} />{facts[0]?.unit}</>, l: facts[0]?.label, d: facts[0]?.desc },
                  { v: <><Count to={90} />{facts[1]?.unit}</>, l: facts[1]?.label, d: facts[1]?.desc },
                  { v: <><Count to={2} />{facts[2]?.unit}</>, l: facts[2]?.label, d: facts[2]?.desc },
                ];
              })().map((f, i) => (
                <Reveal key={i} delay={i * 0.08}>
                  <div className={`${DISPLAY} text-[clamp(3rem,7vw,5.5rem)] font-normal leading-none text-foreground`}>{f.v}</div>
                  <div className={`${MONO} mt-5 text-[11px] uppercase tracking-[0.22em] text-foreground/60`}>{f.l}</div>
                  <p className="mt-3 max-w-[26ch] text-[13px] leading-relaxed text-foreground/40">{f.d}</p>
                </Reveal>
              ))}
            </div>
          </section>

          {/* ══════ PRODUCT SHOWCASE — scroll-driven 3D laptop ══════ */}
          <LaptopShowcase />

          {/* ══════ HOW IT WORKS — process steps (flows with the page, no scroll-trap) ══════ */}
          <section id="how" className="border-t border-foreground/[0.08] py-16 sm:py-32">
            <div className="mx-auto max-w-[1600px] px-6 sm:px-10">
              <div className="mb-14">
                <Label className="mb-6 block">{t('home.process.label')}</Label>
                <h2 className={`${DISPLAY} max-w-[18ch] text-[clamp(1.7rem,4vw,3rem)] font-normal leading-[1.05] tracking-[-0.01em] text-foreground`}>
                  {t('home.process.heading')}
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
                {steps.map((s, i) => (
                  <div key={s.key} className="flex min-h-[14rem] flex-col justify-between border border-foreground/[0.1] bg-foreground/[0.015] p-7">
                    <div className={`${MONO} text-[11px] uppercase tracking-[0.22em] text-foreground/40`}>{String(i + 1).padStart(2, '0')} / {s.key}</div>
                    <p className={`${DISPLAY} mt-8 text-[clamp(1.15rem,1.5vw,1.4rem)] font-normal leading-[1.15] text-foreground`}>{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ══════ FIELD / MOBILE ══════ */}
          <section className="border-t border-foreground/[0.08] px-6 py-20 sm:px-10 sm:py-40">
            <div className="mx-auto max-w-[1600px]">
              <Label className="mb-10 block">{t('home.field.label')}</Label>
              <h2 className={`${DISPLAY} text-[clamp(2rem,6vw,4.5rem)] font-normal leading-[0.98] tracking-[-0.02em] text-foreground`}>
                <LineReveal nowrap lines={asArray<string>(t('home.field.lines', { returnObjects: true }))} />
              </h2>
              <div className="mt-16 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
                {asArray<{ title: string; desc: string }>(t('home.field.features', { returnObjects: true })).map((x, i) => (
                  <Reveal key={x.title} delay={i * 0.06}>
                    <div className="border-t border-foreground/[0.12] pt-5">
                      <h3 className="text-[15px] font-medium text-foreground">{x.title}</h3>
                      <p className="mt-2 text-[13px] leading-relaxed text-foreground/45">{x.desc}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
              <Reveal delay={0.1} className="mt-14">
                <StoreBadges />
              </Reveal>
            </div>
          </section>

          {/* ══════ PHONE SHOWCASE — scroll-driven mobile app ══════ */}
          <PhoneShowcase />

          {/* ══════ WHY / THREE-IN-ONE + DIFFERENTIATORS ══════ */}
          <section className="border-t border-foreground/[0.08] px-6 py-20 sm:px-10 sm:py-40">
            <div className="mx-auto max-w-[1600px]">
              <Label className="mb-10 block">{t('home.why.label')}</Label>
              <h2 className={`${DISPLAY} max-w-[20ch] text-[clamp(1.8rem,5vw,3.6rem)] font-normal leading-[1.02] tracking-[-0.02em] text-foreground`}>
                {t('home.why.heading')}
              </h2>
              <p className="mt-6 max-w-[54ch] text-[15px] leading-relaxed text-foreground/50">{t('home.why.lead')}</p>

              {/* comparison */}
              <Reveal delay={0.1}>
                <div className="mt-14 overflow-hidden rounded-[20px] border border-foreground/[0.1] bg-gradient-to-b from-foreground/[0.04] to-transparent shadow-[0_28px_70px_-45px_rgba(0,0,0,0.5)]">
                  <div className="hidden grid-cols-[1.7fr_1fr_1.1fr] items-center gap-4 border-b border-foreground/[0.08] px-8 py-5 sm:grid">
                    <span className={`${MONO} text-[10px] uppercase tracking-[0.2em] text-foreground/35`}>{t('home.why.compare.otherwise')}</span>
                    <span className={`${MONO} text-[10px] uppercase tracking-[0.2em] text-foreground/35`}>{t('home.why.compare.typicalCost')}</span>
                    <span className={`${DISPLAY} text-[15px] font-medium text-foreground`}>HBCField</span>
                  </div>
                  {asArray<{ name: string; vendors: string; cost: string }>(t('home.why.compare.rows', { returnObjects: true })).map((r) => (
                    <div key={r.name} className="grid grid-cols-1 gap-1.5 border-b border-foreground/[0.05] px-8 py-5 transition-colors hover:bg-foreground/[0.015] sm:grid-cols-[1.7fr_1fr_1.1fr] sm:items-center sm:gap-4">
                      <span className="text-[15px] text-foreground/85">
                        {r.name} <span className="text-foreground/35">{r.vendors}</span>
                      </span>
                      <span className={`${MONO} text-[13px] text-foreground/45`}>{r.cost}</span>
                      <span className="inline-flex items-center gap-2.5">
                        <span className="flex size-5 items-center justify-center rounded-full bg-[#10b981]/15">
                          <Check className="h-3 w-3 text-[#10b981]" strokeWidth={3} />
                        </span>
                        <span className="text-[13px] text-foreground/70">{t('home.why.compare.included')}</span>
                      </span>
                    </div>
                  ))}
                  <div className="grid grid-cols-1 gap-1.5 border-t border-foreground/[0.1] bg-gradient-to-r from-[#5B9BD5]/[0.08] via-transparent to-transparent px-8 py-6 sm:grid-cols-[1.7fr_1fr_1.1fr] sm:items-center sm:gap-4">
                    <span className={`${DISPLAY} text-[17px] font-medium text-foreground`}>{t('home.why.compare.sumLabel')}</span>
                    <span className={`${MONO} text-[13px] text-foreground/40 line-through`}>{t('home.why.compare.sumCost')}</span>
                    <span className={`${DISPLAY} text-[16px] font-medium text-[#2f6fb0] dark:text-[#7db4e6]`}>{t('home.why.compare.sumUs', { price: formatCents(FIELD_STACK_PER_PERSON) })}</span>
                  </div>
                </div>
              </Reveal>

              {/* differentiators */}
              <Label className="mb-8 mt-24 block">{t('home.why.diffLabel')}</Label>
              <div className="grid gap-4 sm:grid-cols-2">
                {asArray<{ title: string; body: string }>(t('home.why.diffs', { returnObjects: true })).map((d, i) => (
                  <Reveal key={d.title} delay={i * 0.06} className="h-full">
                    <div className="group h-full rounded-[18px] border border-foreground/[0.09] bg-gradient-to-b from-foreground/[0.04] to-transparent p-8 transition-all duration-300 hover:border-foreground/20 hover:from-foreground/[0.06]">
                      <span className={`${MONO} text-[11px] tracking-[0.1em] text-[#5B9BD5]`}>{String(i + 1).padStart(2, '0')}</span>
                      <h3 className={`${DISPLAY} mt-5 text-[19px] font-medium tracking-[-0.01em] text-foreground`}>{d.title}</h3>
                      <p className="mt-3 text-[14px] leading-relaxed text-foreground/50">{d.body}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          {/* ══════ INDUSTRIES / WHO IT'S FOR ══════ */}
          <section id="industries" className="border-t border-foreground/[0.08] px-6 py-20 sm:px-10 sm:py-40">
            <div className="mx-auto max-w-[1600px]">
              <Label className="mb-10 block">{t('home.industries.label')}</Label>
              <h2 className={`${DISPLAY} max-w-[20ch] text-[clamp(1.8rem,5vw,3.6rem)] font-normal leading-[1.02] tracking-[-0.02em] text-foreground`}>
                {t('home.industries.heading')}
              </h2>
              <p className="mt-6 max-w-[56ch] text-[15px] leading-relaxed text-foreground/50">{t('home.industries.lead')}</p>

              <div className="mt-16 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {asArray<{ name: string; who: string; how: string; benefit: string }>(t('home.industries.fields', { returnObjects: true })).map((f, i) => (
                  <Reveal key={f.name} delay={(i % 3) * 0.06} className="h-full">
                    <Link href={industryPath(lang, INDUSTRY_SLUGS[i] ?? INDUSTRY_SLUGS[0])} className="group flex h-full flex-col rounded-[18px] border border-foreground/[0.09] bg-gradient-to-b from-foreground/[0.04] to-transparent p-7 transition-all duration-300 hover:border-foreground/20 hover:from-foreground/[0.06]">
                      <span className={`${MONO} text-[11px] tracking-[0.1em] text-[#5B9BD5]`}>{String(i + 1).padStart(2, '0')}</span>
                      <h3 className={`${DISPLAY} mt-4 text-[19px] font-medium tracking-[-0.01em] text-foreground`}>{f.name}</h3>
                      <dl className="mt-6 flex-1 space-y-4 text-[13.5px] leading-relaxed">
                        <div>
                          <dt className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-foreground/35`}>{t('home.industries.whoLabel')}</dt>
                          <dd className="mt-1 text-foreground/60">{f.who}</dd>
                        </div>
                        <div>
                          <dt className={`${MONO} text-[10px] uppercase tracking-[0.16em] text-foreground/35`}>{t('home.industries.howLabel')}</dt>
                          <dd className="mt-1 text-foreground/60">{f.how}</dd>
                        </div>
                      </dl>
                      <div className="mt-5 border-t border-foreground/[0.08] pt-4">
                        <dt className={`${MONO} flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-[#10b981]`}>
                          <Zap className="h-3 w-3 shrink-0" />{t('home.industries.benefitLabel')}
                        </dt>
                        <dd className="mt-1 text-[13.5px] font-medium leading-relaxed text-emerald-700 dark:text-[#cfe8da]">{f.benefit}</dd>
                      </div>
                    </Link>
                  </Reveal>
                ))}
              </div>
              <Link href={industriesHubPath(lang)} className={`${MONO} mt-10 inline-block text-[11px] uppercase tracking-[0.14em] text-foreground/40 transition-colors hover:text-foreground`}>
                {t('home.industries.more')} →
              </Link>
            </div>
          </section>

          {/* ══════ PRICING ══════ */}
          <section id="pricing" className="border-t border-foreground/[0.08] px-6 py-20 sm:px-10 sm:py-40">
            <div className="mx-auto max-w-[1600px]">
              <Label className="mb-10 block">{t('home.pricing.label')}</Label>
              <h2 className={`${DISPLAY} text-[clamp(1.8rem,5vw,3.6rem)] font-normal leading-[1.02] tracking-[-0.02em] text-foreground`}>
                {t('home.pricing.heading')}
              </h2>
              <p className="mt-6 max-w-[50ch] text-[15px] leading-relaxed text-foreground/50">{t('home.pricing.lead')}</p>

              {/* outcomes strip */}
              <div className="mt-14 grid gap-x-12 gap-y-8 sm:grid-cols-3">
                {asArray<{ title: string; body: string }>(t('home.pricing.outcomes', { returnObjects: true })).map((o, i) => (
                  <Reveal key={o.title} delay={i * 0.06}>
                    <div className="border-t border-foreground/[0.12] pt-5">
                      <h3 className="text-[15px] font-medium text-foreground">{o.title}</h3>
                      <p className="mt-2 text-[13px] leading-relaxed text-foreground/45">{o.body}</p>
                    </div>
                  </Reveal>
                ))}
              </div>

              {/*
                Three price cards, not four plan columns.

                There is nothing to choose between any more — the bill is people
                plus what each site switched on plus company add-ons — so the job
                of this block is to say what each of those three costs, and get
                out of the way of the full price list below it.
              */}
              <div className="mt-16 grid gap-5 sm:grid-cols-3">
                {asArray<{ name: string; price: string; unit: string; desc: string }>(t('home.pricing.parts', { returnObjects: true })).map((p, i) => (
                  <Reveal key={p.name} delay={i * 0.08} className="h-full">
                    <div className="h-full rounded-[20px] bg-gradient-to-b from-foreground/[0.14] to-foreground/[0.02] p-px">
                      <div className="flex h-full flex-col rounded-[19px] bg-card p-8">
                        <span className={`${MONO} text-[11px] uppercase tracking-[0.2em] text-foreground/55`}>{p.name}</span>
                        <div className="mt-6 flex items-baseline gap-1.5">
                          <span className={`${DISPLAY} text-[2.9rem] font-normal leading-none text-foreground`}>{p.price}</span>
                          <span className={`${MONO} text-[11px] text-foreground/40`}>{p.unit}</span>
                        </div>
                        <p className="mt-4 text-[13px] leading-relaxed text-foreground/50">{p.desc}</p>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>

              {/*
                The estimator, not a fourth column.

                A column can only show one combination of people, sites and
                modules — and the bill is all three. Letting somebody put their
                own numbers in answers "what will this cost ME", which is the
                only question a pricing page is ever really asked. Every figure
                comes from the same functions the invoice is built from.
              */}
              <Reveal className="mt-14">
                <PricingEstimator />
              </Reveal>

              <div className="mt-10 flex flex-wrap items-center gap-4">
                <a
                  href="#contact"
                  onClick={navTo('#contact')}
                  className={`${MONO} inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-6 py-3.5 text-[11px] uppercase tracking-[0.2em] text-background transition-colors hover:bg-foreground/90`}
                >
                  {t('home.pricing.cta')}
                </a>
                {/*
                  Leaves the page, and must: this is the one control on the
                  home page whose label promises EVERY price, and every price
                  lives on /pricing. It used to smooth-scroll to the capability
                  cards below — the section that deliberately shows one number
                  per capability and not the full list — so the promise and the
                  destination disagreed.
                */}
                <Link
                  href="/pricing"
                  className={`${MONO} group inline-flex items-center justify-center gap-2 rounded-full border border-foreground/20 px-6 py-3.5 text-[11px] uppercase tracking-[0.2em] text-foreground/80 transition-colors hover:border-foreground/50 hover:text-foreground`}
                >
                  {t('home.pricing.seePrices', 'See every price')}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
              <p className={`${MONO} mt-8 text-[11px] uppercase tracking-[0.14em] text-foreground/30`}>{t('home.pricing.note')}</p>
            </div>
          </section>

          {/* ══════ FEATURE COMPARISON (code-driven) ══════ */}
          <section id="features" className="border-t border-foreground/[0.08] px-6 py-20 sm:px-10 sm:py-40">
            <div className="mx-auto max-w-[1600px]">
              <Label className="mb-10 block">{t('home.compare.label', 'What you can add')}</Label>
              <h2 className={`${DISPLAY} text-[clamp(1.8rem,5vw,3.6rem)] font-normal leading-[1.02] tracking-[-0.02em] text-foreground`}>
                {t('home.compare.heading', 'Switch on only what you need')}
              </h2>
              <p className="mt-6 max-w-[50ch] text-[15px] leading-relaxed text-foreground/50">
                {t('home.compare.lead', 'Nothing is locked behind a plan. Turn something on when you need it, off when you do not — the bill follows the same day.')}
              </p>
              <Reveal className="mt-14">
                <FeatureMatrix />
              </Reveal>
            </div>
          </section>

          {/* ══════ FAQ ══════ */}
          <section id="faq" className="border-t border-foreground/[0.08] px-6 py-20 sm:px-10 sm:py-40">
            <div className="mx-auto max-w-[1600px]">
              <Label className="mb-10 block">{t('home.faq.label', 'FAQ')}</Label>
              <h2 className={`${DISPLAY} text-[clamp(1.8rem,5vw,3.6rem)] font-normal leading-[1.02] tracking-[-0.02em] text-foreground`}>
                {t('home.faq.heading', 'Questions, answered.')}
              </h2>
              <div className="mt-14 grid gap-px overflow-hidden rounded-lg border border-foreground/[0.08] bg-foreground/[0.08] sm:grid-cols-2">
                {asArray<{ q: string; a: string }>(t('home.faq.items', { returnObjects: true })).map((item, i) => (
                  <Reveal key={i} className="bg-background p-7 sm:p-9">
                    <h3 className={`${DISPLAY} text-[19px] leading-snug tracking-[-0.01em] text-foreground`}>{item.q}</h3>
                    <p className="mt-3 text-[15px] leading-relaxed text-foreground/55">{item.a}</p>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          {/* ══════ CTA ══════ */}
          <section id="contact" className="border-t border-foreground/[0.08] px-6 py-20 sm:px-10 sm:py-44">
            <div className="mx-auto max-w-[1600px]">
              <Label className="mb-10 block">{t('home.cta.label')}</Label>
              <h2 className={`${DISPLAY} text-[clamp(2.4rem,8vw,6.5rem)] font-normal leading-[0.95] tracking-[-0.02em] text-foreground`}>
                <LineReveal nowrap lines={asArray<string>(t('home.cta.lines', { returnObjects: true }))} />
              </h2>
              <Reveal delay={0.2} className="mt-14">
                <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
                  <Link href="/login?mode=register" className={`${MONO} group inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full bg-foreground px-9 py-4 text-[12px] uppercase tracking-[0.2em] text-background shadow-lg shadow-foreground/10 transition-all hover:scale-[1.02] hover:bg-foreground/90`}>
                    {t('home.cta.requestDemo')}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <a href="mailto:office@hbcfield.com?subject=HBCField%20enquiry" className={`${MONO} group inline-flex items-center gap-2 border-b border-foreground/25 pb-1 text-[12px] uppercase tracking-[0.16em] text-foreground/70 transition-colors hover:border-foreground hover:text-foreground`}>
                    {t('home.cta.talkToSales')}
                    <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </a>
                </div>
                <p className={`${MONO} mt-6 text-[11px] uppercase tracking-[0.18em] text-foreground/35`}>{t('home.cta.trialNote')}</p>
              </Reveal>
            </div>
          </section>

          {/* ══════ FOOTER ══════ */}
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
                <span aria-hidden className={`${DISPLAY} pointer-events-none select-none whitespace-nowrap text-[clamp(4rem,17vw,15rem)] font-normal leading-[0.78] tracking-[-0.04em] text-foreground/[0.045]`}>
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
        </div>
    </>
  );
}

/** A titled column of footer links — on-page anchors (#) smooth-scroll, routes
 *  use Next's client nav. */
function FooterCol({ title, links }: { title: string; links: { label: string; href: string; onClick?: (e: React.MouseEvent) => void }[] }) {
  const linkCls = 'text-[14px] text-foreground/55 transition-colors hover:text-foreground';
  return (
    <div>
      <div className={`${MONO} mb-5 text-[10px] uppercase tracking-[0.28em] text-foreground/30`}>{title}</div>
      <ul className="space-y-3">
        {links.map((l) => (
          <li key={l.label}>
            {l.href.startsWith('#') ? (
              <a href={l.href} onClick={l.onClick} className={linkCls}>{l.label}</a>
            ) : (
              <Link href={l.href} className={linkCls}>{l.label}</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Four "+" registration marks pinned to the viewport corners. */
function FramePlus() {
  const cls = `${MONO} pointer-events-none fixed z-30 select-none text-[13px] text-foreground/25`;
  return (
    <>
      <span className={`${cls} left-3 top-3`}>+</span>
      <span className={`${cls} right-3 top-3`}>+</span>
      <span className={`${cls} bottom-3 left-3`}>+</span>
      <span className={`${cls} bottom-3 right-3`}>+</span>
    </>
  );
}
