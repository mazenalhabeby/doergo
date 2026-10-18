'use client';

import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { IntroVideo } from './IntroVideo';
import { LaptopShowcase } from './LaptopShowcase';
import { PhoneShowcase } from './PhoneShowcase';
import { StoreBadges } from './StoreBadges';
import { FeatureMatrix } from './FeatureMatrix';
import { asArray } from './i18n-array';
import { DISPLAY, MONO, Reveal, LineReveal, Count, Label, FramePlus } from './home-client-helpers';
import { HomeClientFooter } from './home-client-footer';
import { HomeClientHero } from './home-client-hero';
import { HomeClientNav } from './home-client-nav';
import { HomeClientPricing } from './home-client-pricing';
import { HomeClientWhy } from './home-client-why';
import { HomeClientIndustries } from './home-client-industries';
import type { HomeClientState } from './use-home-client';
import type HomeClient from './HomeClient';

/** Part of HomeClient's markup, moved here unchanged; it reads the page's state from `vm`. */
export function HomeClientWhatItIs({ vm, lang }: { vm: HomeClientState; lang: NonNullable<Parameters<typeof HomeClient>[0]['lang']> }) {
  const { t, steps } = vm;
  return (
    <div className={`min-h-screen bg-background text-foreground antialiased selection:bg-foreground/20 ${DISPLAY}`}>
        {/* corner registration marks (fixed frame) */}
        <FramePlus />

        {/* ══════ NAV ══════ */}
        <HomeClientNav vm={vm} />

        {/* ══════ HERO — always dark (explicit bg so the page theme never lightens it) ══════ */}
        <HomeClientHero vm={vm} />

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
                  <h2
                    className={(`${DISPLAY} max-w-[16ch] text-[clamp(1.8rem,4.4vw,3.4rem)] font-normal ` +
                      `leading-[1.03] tracking-[-0.01em] text-foreground`)}>
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
              <h2
                className={(`${DISPLAY} max-w-[18ch] text-[clamp(1.7rem,4vw,3rem)] font-normal ` +
                  `leading-[1.05] tracking-[-0.01em] text-foreground`)}>
                {t('home.process.heading')}
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
              {steps.map((s, i) => (
                <div
                  key={s.key}
                  className={"flex min-h-[14rem] flex-col justify-between border " + "border-foreground/[0.1] bg-foreground/[0.015] p-7"}>
                  <div
                    className={`${MONO} text-[11px] uppercase tracking-[0.22em] text-foreground/40`}>{String(i + 1).padStart(
                      2,
                      '0')} / {s.key}</div>
                  <p
                    className={`${DISPLAY} mt-8 text-[clamp(1.15rem,1.5vw,1.4rem)] font-normal leading-[1.15] text-foreground`}>{s.desc}</p>
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
        <HomeClientWhy vm={vm} />

        {/* ══════ INDUSTRIES / WHO IT'S FOR ══════ */}
        <HomeClientIndustries vm={vm} lang={lang} />

        {/* ══════ PRICING ══════ */}
        <HomeClientPricing vm={vm} />

        {/* ══════ FEATURE COMPARISON (code-driven) ══════ */}
        <section id="features" className="border-t border-foreground/[0.08] px-6 py-20 sm:px-10 sm:py-40">
          <div className="mx-auto max-w-[1600px]">
            <Label className="mb-10 block">{t('home.compare.label', 'What you can add')}</Label>
            <h2 className={`${DISPLAY} text-[clamp(1.8rem,5vw,3.6rem)] font-normal leading-[1.02] tracking-[-0.02em] text-foreground`}>
              {t('home.compare.heading', 'Switch on only what you need')}
            </h2>
            <p className="mt-6 max-w-[50ch] text-[15px] leading-relaxed text-foreground/50">
              {t(
                'home.compare.lead',
                ('Nothing is locked behind a plan. Turn something on when you need it, off ' +
                  'when you do not — the bill follows the same day.'))}
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
            <div
              className={"mt-14 grid gap-px overflow-hidden rounded-lg border " +
                "border-foreground/[0.08] bg-foreground/[0.08] sm:grid-cols-2"}>
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
                <Link
                  href="/login?mode=register"
                  className={(`${MONO} group inline-flex shrink-0 items-center gap-2.5 ` +
                    `whitespace-nowrap rounded-full bg-foreground px-9 py-4 text-[12px] ` +
                    `uppercase tracking-[0.2em] text-background shadow-lg ` +
                    `shadow-foreground/10 transition-all hover:scale-[1.02] ` +
                    `hover:bg-foreground/90`)}>
                  {t('home.cta.requestDemo')}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <a
                  href="mailto:office@hbcfield.com?subject=HBCField%20enquiry"
                  className={(`${MONO} group inline-flex items-center gap-2 border-b ` +
                    `border-foreground/25 pb-1 text-[12px] uppercase tracking-[0.16em] ` +
                    `text-foreground/70 transition-colors hover:border-foreground ` +
                    `hover:text-foreground`)}>
                  {t('home.cta.talkToSales')}
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </a>
              </div>
              <p className={`${MONO} mt-6 text-[11px] uppercase tracking-[0.18em] text-foreground/35`}>{t('home.cta.trialNote')}</p>
            </Reveal>
          </div>
        </section>

        {/* ══════ FOOTER ══════ */}
        <HomeClientFooter vm={vm} />
      </div>
  );
}
