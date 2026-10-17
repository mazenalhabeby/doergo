'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'next-themes';
import { Sun, Moon, ChevronDown, Users, Blocks, Building2 } from 'lucide-react';
import { AnimatedLogo } from '@hbcfield/shared/components';
import {
  AVAILABLE_MODULES,
  AVAILABLE_ADD_ONS,
  MODULE_MONTHLY_CENTS,
  MODULE_USAGE_PRICING,
  SEAT_MONTHLY_CENTS,
  formatCents,
  usageCost,
} from '@hbcfield/shared/client';
import { LanguageSwitcher } from '@/components/language-switcher';
import { CAPABILITY_GROUPS, ungroupedModuleKeys } from '@/lib/capability-groups';
import { Calculator } from './Calculator';
import { asArray } from '@/app/_home/i18n-array';
import { usePricingClient } from './use-pricing-client';
import {
  DISPLAY,
  MONO,
  ACCENT,
  SectionHead,
  PartCard,
  ModuleRow,
  LadderCard,
  Faq,
} from './pricing-client-helpers';

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
  const { t, resolvedTheme, setTheme, orphans, rules } = usePricingClient();

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
              className="inline-flex size-8 items-center justify-center rounded-full text-foreground/50 transition-colors hover:bg-foreground/10 hover:text-foreground"
            >
              {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <LanguageSwitcher />
            <Link
              href="/login?mode=register"
              className={`${MONO} inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-[#04121f] transition-opacity hover:opacity-90`}
              style={{ backgroundColor: ACCENT }}
            >
              {t('pricing.startTrial', 'Start free')}
            </Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-[1400px] px-6 sm:px-10">
        {/* ── hero ──────────────────────────────────────────────────────── */}
        <header className="py-16 sm:py-24">
          <p className={`${MONO} text-[11px] uppercase tracking-[0.28em] text-foreground/40`}>
            {t('pricing.eyebrow', 'Pricing')}
          </p>
          <h1 className={`${DISPLAY} mt-6 max-w-[18ch] text-[clamp(2.2rem,6vw,4.2rem)] font-normal leading-[1.02] tracking-[-0.025em]`}>
            {t('pricing.heading', 'Every price we charge, on one page.')}
          </h1>
          <p className="mt-6 max-w-[58ch] text-[17px] leading-relaxed text-foreground/55">
            {t(
              'pricing.lead',
              'No plans, no tiers, nothing hidden behind “contact sales”. Your bill is three things added together, and you can work it out yourself in under a minute.',
            )}
          </p>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            <PartCard
              icon={<Users className="h-4 w-4" />}
              n="1"
              title={t('pricing.parts.seats.title', 'The people')}
              price={t('pricing.parts.seats.price', '{{price}} each', { price: formatCents(SEAT_MONTHLY_CENTS) })}
              body={t('pricing.parts.seats.body', 'Per person, per month. Office, field or owner — the same price, so there is nothing to argue about.')}
            />
            <PartCard
              icon={<Blocks className="h-4 w-4" />}
              n="2"
              title={t('pricing.parts.modules.title', 'What each site does')}
              price={t('pricing.parts.modules.price', 'from {{price}}', { price: formatCents(300) })}
              body={t('pricing.parts.modules.body', 'Switch a capability on where you need it. A site that does not need GPS never pays for GPS.')}
            />
            <PartCard
              icon={<Building2 className="h-4 w-4" />}
              n="3"
              title={t('pricing.parts.addOns.title', 'Company-wide extras')}
              price={t('pricing.parts.addOns.price', 'from {{price}}', { price: formatCents(900) })}
              body={t('pricing.parts.addOns.body', 'Invoicing, rotas, audit trail. Bought once for the business, however many sites you run.')}
            />
          </div>
        </header>

        {/* ── calculator ────────────────────────────────────────────────── */}
        <section id="calculator" className="border-t border-foreground/[0.08] py-16 sm:py-24">
          <SectionHead
            n="01"
            title={t('pricing.calcHeading', 'Work out what it costs you')}
            lead={t('pricing.calcLead', 'Set it up the way your business actually runs. Every figure is calculated by the same code that produces a real invoice.')}
          />
          <div className="mt-12">
            <Calculator />
          </div>
        </section>

        {/* ── every module ──────────────────────────────────────────────── */}
        <section id="modules" className="border-t border-foreground/[0.08] py-16 sm:py-24">
          <SectionHead
            n="02"
            title={t('pricing.modulesHeading', 'Every capability, and what it costs')}
            lead={t('pricing.modulesLead', 'Priced per site, per month. Switch one off and it stops being charged the same day.')}
          />

          <div className="mt-12 space-y-10">
            {CAPABILITY_GROUPS.filter((g) => g.modules.length > 0).map((g) => (
              <div key={g.key}>
                <div className="flex items-center gap-3">
                  <span
                    className="flex size-8 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${ACCENT}1f`, color: ACCENT }}
                  >
                    {g.icon}
                  </span>
                  <h3 className={`${DISPLAY} text-[19px] tracking-[-0.01em]`}>{t(`home.groups.${g.key}.title`, g.key)}</h3>
                </div>
                <div className="mt-4 overflow-hidden rounded-xl border border-foreground/[0.10]">
                  {g.modules.map((k, i) => (
                    <ModuleRow key={k} moduleKey={k} first={i === 0} />
                  ))}
                </div>
              </div>
            ))}

            {orphans.length > 0 && (
              <div>
                <h3 className={`${DISPLAY} text-[19px] tracking-[-0.01em]`}>{t('pricing.otherModules', 'Everything else')}</h3>
                <div className="mt-4 overflow-hidden rounded-xl border border-foreground/[0.10]">
                  {orphans.map((k, i) => (
                    <ModuleRow key={k} moduleKey={k} first={i === 0} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── counted modules ───────────────────────────────────────────── */}
        <section id="counted" className="border-t border-foreground/[0.08] py-16 sm:py-24">
          <SectionHead
            n="03"
            title={t('pricing.laddersHeading', 'The three things priced by how many you have')}
            lead={t(
              'pricing.laddersLead',
              'Everything else is a flat switch. These three grow with you — and get cheaper per item as they do, like a tax band: passing a threshold only re-prices the ones above it, so adding one can never make your bill jump.',
            )}
          />
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {Object.keys(MODULE_USAGE_PRICING).map((k) => (
              <LadderCard key={k} moduleKey={k} />
            ))}
          </div>
        </section>

        {/* ── add-ons ───────────────────────────────────────────────────── */}
        <section id="add-ons" className="border-t border-foreground/[0.08] py-16 sm:py-24">
          <SectionHead
            n="04"
            title={t('pricing.addOnsHeading', 'Bought once for the whole company')}
            lead={t('pricing.addOnsLead', 'Not per site, not per person. One price, works everywhere.')}
          />
          <div className="mt-12 overflow-hidden rounded-xl border border-foreground/[0.10]">
            {AVAILABLE_ADD_ONS.map((a, i) => (
              <div
                key={a.key}
                className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 p-4 sm:px-6 ${i > 0 ? 'border-t border-foreground/[0.07]' : ''}`}
              >
                <span className="min-w-[11rem] text-[14.5px] text-foreground">{t(`addOns.${a.key}.label`, a.label)}</span>
                <span className="flex-1 text-[13px] leading-relaxed text-foreground/45">
                  {t(`addOns.${a.key}.description`, a.description)}
                </span>
                <span className={`${MONO} text-[13px] text-foreground [font-variant-numeric:tabular-nums]`}>
                  {formatCents(a.monthlyCents)}
                  <span className="text-foreground/35"> {t('pricing.perMonth', '/ mo')}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── the rules ─────────────────────────────────────────────────── */}
        <section id="rules" className="border-t border-foreground/[0.08] py-16 sm:py-24">
          <SectionHead
            n="05"
            title={t('pricing.rulesHeading', 'How billing actually behaves')}
            lead={t('pricing.rulesLead', 'The parts people find out about later, written down before you pay.')}
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rules.map((r, i) => (
              <div key={i} className="rounded-2xl border border-foreground/[0.10] p-6">
                <h3 className={`${DISPLAY} text-[16px] leading-snug tracking-[-0.01em]`}>{r.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-foreground/50">{r.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── faq ───────────────────────────────────────────────────────── */}
        <section id="faq" className="border-t border-foreground/[0.08] py-16 sm:py-24">
          <SectionHead n="06" title={t('pricing.faqHeading', 'Straight answers')} />
          <div className="mt-10 max-w-[70ch]">
            {asArray<{ q: string; a: string }>(t('pricing.faq', { returnObjects: true })).map((f, i) => (
              <Faq key={i} q={f.q} a={f.a} />
            ))}
          </div>
        </section>

        {/* ── cta ───────────────────────────────────────────────────────── */}
        <section className="border-t border-foreground/[0.08] py-16 text-center sm:py-24">
          <h2 className={`${DISPLAY} mx-auto max-w-[20ch] text-[clamp(1.8rem,4.5vw,3rem)] font-normal leading-[1.05] tracking-[-0.02em]`}>
            {t('pricing.ctaHeading', 'Try it before you pay for it.')}
          </h2>
          <p className="mx-auto mt-5 max-w-[50ch] text-[15.5px] leading-relaxed text-foreground/55">
            {t('pricing.ctaBody', '14 days, everything switched on, no card. If it does not fit, nothing happens when the trial ends.')}
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link
              href="/login?mode=register"
              className={`${MONO} inline-flex items-center rounded-full px-6 py-3 text-[11px] uppercase tracking-[0.2em] text-[#04121f] transition-opacity hover:opacity-90`}
              style={{ backgroundColor: ACCENT }}
            >
              {t('pricing.startTrial', 'Start free')}
            </Link>
            <a
              href="mailto:office@hbcfield.com?subject=HBCField%20pricing"
              className={`${MONO} inline-flex items-center rounded-full border border-foreground/20 px-6 py-3 text-[11px] uppercase tracking-[0.2em] text-foreground/70 transition-colors hover:border-foreground/50 hover:text-foreground`}
            >
              {t('pricing.talkToUs', 'Talk to us')}
            </a>
          </div>
        </section>

        <footer className={`${MONO} border-t border-foreground/[0.08] py-8 text-[11px] text-foreground/35`}>
          <Link href="/" className="hover:text-foreground/70">HBCField</Link>
          <span className="mx-2">·</span>
          <Link href="/privacy" className="hover:text-foreground/70">{t('home.footer.linkPrivacy', 'Privacy')}</Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="hover:text-foreground/70">{t('home.footer.linkTerms', 'Terms')}</Link>
        </footer>
      </div>
    </main>
  );
}
