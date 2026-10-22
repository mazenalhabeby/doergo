"use client"

import { useTranslation } from "react-i18next"
import Link from "next/link"
import { ArrowRight, ArrowDown, Zap } from "lucide-react"
import { HeroCanvas } from "./HeroCanvas"
import { StoreBadges } from "./StoreBadges"
import { asArray } from "./i18n-array"
import { DISPLAY, MONO, Reveal, CyclingWord } from "./home-ui"

/** The always-dark hero: the 3D mark, the headline with its cycling word, the calls to action. */
export function HomeHero({ reduced }: { reduced: boolean }) {
  const { t } = useTranslation()
  return (
    <section
      id="top"
      className={
        "relative flex min-h-screen flex-col justify-center overflow-hidden " +
        "bg-[#0e1116] px-6 text-[#d8d8d8] sm:px-10"
      }
    >
      {/* the logo, rebuilt as an interactive 3D faceted gemstone / crystal mark, is the centrepiece */}
      <div className="absolute inset-0">
        <HeroCanvas interactive={!reduced} />
      </div>

      {/* headline top-left with a cycling last word (trionn treatment) */}
      <div className="pointer-events-none absolute left-6 top-28 sm:left-10 sm:top-32">
        <Reveal>
          <h1
            className={`${DISPLAY} text-[clamp(2.4rem,6.5vw,5.5rem)] font-normal leading-[0.96] tracking-[-0.02em] text-[#efefec]`}
          >
            {t("home.hero.line1")}
            <br />
            {t("home.hero.under")}{" "}
            <CyclingWord
              words={asArray<string>(t("home.hero.words", { returnObjects: true }))}
              className="align-baseline"
            />
            .
          </h1>
        </Reveal>
        {/* desktop/tablet: CTA sits under the headline. On mobile it moves to the bottom-right (below) */}
        <Reveal delay={0.15} className="pointer-events-auto mt-8 hidden sm:block">
          <Link
            href="/login?mode=register"
            className={
              `${MONO} group inline-flex items-center gap-3 border-b border-white/25 ` +
              `pb-1 text-[12px] uppercase tracking-[0.22em] text-white/80 ` +
              `transition-colors hover:border-white hover:text-white`
            }
          >
            {t("home.hero.requestDemo")}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </Link>
          <StoreBadges size="sm" className="mt-7" />
        </Reveal>
      </div>

      {/* mobile-only CTA — pinned bottom-right, balancing the scroll cue on the left */}
      <div className="pointer-events-none absolute inset-x-6 bottom-8 flex justify-end sm:hidden">
        <Link
          href="/login?mode=register"
          className={
            `${MONO} group pointer-events-auto inline-flex items-center gap-2.5 ` +
            `whitespace-nowrap border-b border-white/25 pb-1 text-[11px] uppercase ` +
            `tracking-[0.18em] text-white/80 transition-colors hover:border-white ` +
            `hover:text-white`
          }
        >
          {t("home.hero.requestDemo")}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>

      {/* scroll cue */}
      <div className="pointer-events-none absolute bottom-8 left-6 flex items-center gap-3 sm:left-10">
        <ArrowDown className="h-4 w-4 animate-bounce text-white/40" />
        <span className={`${MONO} text-[11px] uppercase tracking-[0.28em] text-white/40`}>{t("home.hero.scroll")}</span>
      </div>

      {/* interaction hint — electric + product ("the field" = electric field) */}
      <div className="pointer-events-none absolute bottom-8 left-1/2 hidden -translate-x-1/2 items-center gap-2 md:flex">
        <Zap className="h-3.5 w-3.5 text-[#5B9BD5]" />
        <span className={`${MONO} text-[11px] uppercase tracking-[0.28em] text-white/40`}>{t("home.hero.hint")}</span>
      </div>

      {/* meta block — hidden on mobile (it collided with the scroll cue and clipped off-screen) */}
      <div className="pointer-events-none absolute bottom-8 right-6 hidden max-w-[16rem] text-right sm:right-10 md:block">
        <div className={`${MONO} text-[11px] uppercase tracking-[0.2em] text-white/50`}>{t("home.hero.meta")}</div>
        <p className="mt-2 text-[13px] leading-relaxed text-white/40">{t("home.hero.metaDesc")}</p>
      </div>
    </section>
  )
}
