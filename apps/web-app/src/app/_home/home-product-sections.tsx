"use client"

import { useTranslation } from "react-i18next"
import { IntroVideo } from "./IntroVideo"
import { StoreBadges } from "./StoreBadges"
import { asArray } from "./i18n-array"
import { DISPLAY, MONO, Reveal, LineReveal, Count, Label } from "./home-ui"

// The home page's story, in page order: what it is, the film, the facts, the process, the phone app.

/** What it is — the positioning statement, line by line. */
export function HomePositioning() {
  const { t } = useTranslation()
  return (
    <section className="border-t border-foreground/[0.08] px-6 py-20 sm:px-10 sm:py-40">
      <div className="mx-auto max-w-[1600px]">
        <Label className="mb-10 block">{t("home.whatItIs.label")}</Label>
        <h2
          className={`${DISPLAY} text-[clamp(1.7rem,4vw,3.4rem)] font-normal leading-[1.08] tracking-[-0.01em] text-foreground`}
        >
          <LineReveal nowrap lines={asArray<string>(t("home.whatItIs.lines", { returnObjects: true }))} />
        </h2>
      </div>
    </section>
  )
}

/** The intro film with its heading. */
export function HomeIntroVideo() {
  const { t } = useTranslation()
  return (
    <section className="border-t border-foreground/[0.08] px-6 py-16 sm:px-10 sm:py-32">
      <div className="mx-auto max-w-[1600px]">
        <Reveal>
          <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
            <div>
              <Label className="mb-6 block">{t("home.video.label")}</Label>
              <h2
                className={
                  `${DISPLAY} max-w-[16ch] text-[clamp(1.8rem,4.4vw,3.4rem)] font-normal ` +
                  `leading-[1.03] tracking-[-0.01em] text-foreground`
                }
              >
                {t("home.video.title")}
              </h2>
            </div>
            <p className="max-w-[36ch] text-[13px] leading-relaxed text-foreground/45">{t("home.video.desc")}</p>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="mx-auto max-w-[1120px]">
            <IntroVideo />
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/** Three counted-up key facts. */
export function HomeKeyFacts() {
  const { t } = useTranslation()
  return (
    <section className="border-t border-foreground/[0.08] px-6 py-16 sm:px-10 sm:py-24">
      <div className="mx-auto grid max-w-[1600px] gap-10 sm:gap-16 sm:grid-cols-3">
        {(() => {
          const facts = asArray<{ unit: string; label: string; desc: string }>(t("home.facts", { returnObjects: true }))
          return [
            {
              v: (
                <>
                  <Count to={25} />
                  {facts[0]?.unit}
                </>
              ),
              l: facts[0]?.label,
              d: facts[0]?.desc,
            },
            {
              v: (
                <>
                  <Count to={90} />
                  {facts[1]?.unit}
                </>
              ),
              l: facts[1]?.label,
              d: facts[1]?.desc,
            },
            {
              v: (
                <>
                  <Count to={2} />
                  {facts[2]?.unit}
                </>
              ),
              l: facts[2]?.label,
              d: facts[2]?.desc,
            },
          ]
        })().map((f, i) => (
          <Reveal key={i} delay={i * 0.08}>
            <div className={`${DISPLAY} text-[clamp(3rem,7vw,5.5rem)] font-normal leading-none text-foreground`}>
              {f.v}
            </div>
            <div className={`${MONO} mt-5 text-[11px] uppercase tracking-[0.22em] text-foreground/60`}>{f.l}</div>
            <p className="mt-3 max-w-[26ch] text-[13px] leading-relaxed text-foreground/40">{f.d}</p>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/** How it works — the process steps (flows with the page, no scroll-trap). */
export function HomeHowItWorks() {
  const { t } = useTranslation()
  const steps = asArray<{ key: string; desc: string }>(t("home.process.steps", { returnObjects: true }))
  return (
    <section id="how" className="border-t border-foreground/[0.08] py-16 sm:py-32">
      <div className="mx-auto max-w-[1600px] px-6 sm:px-10">
        <div className="mb-14">
          <Label className="mb-6 block">{t("home.process.label")}</Label>
          <h2
            className={
              `${DISPLAY} max-w-[18ch] text-[clamp(1.7rem,4vw,3rem)] font-normal ` +
              `leading-[1.05] tracking-[-0.01em] text-foreground`
            }
          >
            {t("home.process.heading")}
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((s, i) => (
            <div
              key={s.key}
              className={
                "flex min-h-[14rem] flex-col justify-between border " +
                "border-foreground/[0.1] bg-foreground/[0.015] p-7"
              }
            >
              <div className={`${MONO} text-[11px] uppercase tracking-[0.22em] text-foreground/40`}>
                {String(i + 1).padStart(2, "0")} / {s.key}
              </div>
              <p
                className={`${DISPLAY} mt-8 text-[clamp(1.15rem,1.5vw,1.4rem)] font-normal leading-[1.15] text-foreground`}
              >
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** The field / mobile app: headline, features, store badges. */
export function HomeFieldApp() {
  const { t } = useTranslation()
  return (
    <section className="border-t border-foreground/[0.08] px-6 py-20 sm:px-10 sm:py-40">
      <div className="mx-auto max-w-[1600px]">
        <Label className="mb-10 block">{t("home.field.label")}</Label>
        <h2
          className={`${DISPLAY} text-[clamp(2rem,6vw,4.5rem)] font-normal leading-[0.98] tracking-[-0.02em] text-foreground`}
        >
          <LineReveal nowrap lines={asArray<string>(t("home.field.lines", { returnObjects: true }))} />
        </h2>
        <div className="mt-16 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {asArray<{ title: string; desc: string }>(t("home.field.features", { returnObjects: true })).map((x, i) => (
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
  )
}
