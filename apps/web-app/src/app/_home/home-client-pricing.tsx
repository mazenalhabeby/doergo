'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { PricingEstimator } from './PricingEstimator';
import { asArray } from './i18n-array';
import { DISPLAY, MONO, Reveal, Label } from './home-client-helpers';
import type { HomeClientState } from './use-home-client';

/** Part of HomeClient's markup, moved here unchanged; it reads the page's state from `vm`. */
export function HomeClientPricing({ vm }: { vm: HomeClientState }) {
  const { t, navTo } = vm;
  return (
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
          plus what each site switched on plus company options — so the job
          of this block is to say what each of those three costs, and get
          out of the way of the full price list below it.
        */}
        <div className="mt-16 grid gap-5 sm:grid-cols-3">
          {asArray<{ name: string; price: string; unit: string; desc: string }>(
            t('home.pricing.parts', { returnObjects: true })).map((p, i) => (
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
  );
}
