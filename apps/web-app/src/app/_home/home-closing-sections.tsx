"use client"

import Link from "next/link"
import { useTranslation } from "react-i18next"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import { FeatureMatrix } from "./FeatureMatrix"
import { asArray } from "./i18n-array"
import { DISPLAY, MONO, Reveal, LineReveal, Label } from "./home-ui"

// The home page's closing sections: what can be switched on, the FAQ, the call to get in touch.

/** What you can add — the code-driven feature comparison. */
export function HomeFeatureCompare() {
  const { t } = useTranslation()
  return (
    <section id="features" className="border-t border-foreground/[0.08] px-6 py-20 sm:px-10 sm:py-40">
      <div className="mx-auto max-w-[1600px]">
        <Label className="mb-10 block">{t("home.compare.label", "What you can add")}</Label>
        <h2
          className={`${DISPLAY} text-[clamp(1.8rem,5vw,3.6rem)] font-normal leading-[1.02] tracking-[-0.02em] text-foreground`}
        >
          {t("home.compare.heading", "Switch on only what you need")}
        </h2>
        <p className="mt-6 max-w-[50ch] text-[15px] leading-relaxed text-foreground/50">
          {t(
            "home.compare.lead",
            "Nothing is locked behind a plan. Turn something on when you need it, off " +
              "when you do not — the bill follows the same day.",
          )}
        </p>
        <Reveal className="mt-14">
          <FeatureMatrix />
        </Reveal>
      </div>
    </section>
  )
}

/** Questions, answered. */
export function HomeFaq() {
  const { t } = useTranslation()
  return (
    <section id="faq" className="border-t border-foreground/[0.08] px-6 py-20 sm:px-10 sm:py-40">
      <div className="mx-auto max-w-[1600px]">
        <Label className="mb-10 block">{t("home.faq.label", "FAQ")}</Label>
        <h2
          className={`${DISPLAY} text-[clamp(1.8rem,5vw,3.6rem)] font-normal leading-[1.02] tracking-[-0.02em] text-foreground`}
        >
          {t("home.faq.heading", "Questions, answered.")}
        </h2>
        <div
          className={
            "mt-14 grid gap-px overflow-hidden rounded-lg border " +
            "border-foreground/[0.08] bg-foreground/[0.08] sm:grid-cols-2"
          }
        >
          {asArray<{ q: string; a: string }>(t("home.faq.items", { returnObjects: true })).map((item, i) => (
            <Reveal key={i} className="bg-background p-7 sm:p-9">
              <h3 className={`${DISPLAY} text-[19px] leading-snug tracking-[-0.01em] text-foreground`}>{item.q}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-foreground/55">{item.a}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/** The closing call to action: register, or talk to sales. */
export function HomeContactCta() {
  const { t } = useTranslation()
  return (
    <section id="contact" className="border-t border-foreground/[0.08] px-6 py-20 sm:px-10 sm:py-44">
      <div className="mx-auto max-w-[1600px]">
        <Label className="mb-10 block">{t("home.cta.label")}</Label>
        <h2
          className={`${DISPLAY} text-[clamp(2.4rem,8vw,6.5rem)] font-normal leading-[0.95] tracking-[-0.02em] text-foreground`}
        >
          <LineReveal nowrap lines={asArray<string>(t("home.cta.lines", { returnObjects: true }))} />
        </h2>
        <Reveal delay={0.2} className="mt-14">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
            <Link
              href="/login?mode=register"
              className={
                `${MONO} group inline-flex shrink-0 items-center gap-2.5 ` +
                `whitespace-nowrap rounded-full bg-foreground px-9 py-4 text-[12px] ` +
                `uppercase tracking-[0.2em] text-background shadow-lg ` +
                `shadow-foreground/10 transition-all hover:scale-[1.02] ` +
                `hover:bg-foreground/90`
              }
            >
              {t("home.cta.requestDemo")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="mailto:office@hbcfield.com?subject=HBCField%20enquiry"
              className={
                `${MONO} group inline-flex items-center gap-2 border-b ` +
                `border-foreground/25 pb-1 text-[12px] uppercase tracking-[0.16em] ` +
                `text-foreground/70 transition-colors hover:border-foreground ` +
                `hover:text-foreground`
              }
            >
              {t("home.cta.talkToSales")}
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </div>
          <p className={`${MONO} mt-6 text-[11px] uppercase tracking-[0.18em] text-foreground/35`}>
            {t("home.cta.trialNote")}
          </p>
        </Reveal>
      </div>
    </section>
  )
}
