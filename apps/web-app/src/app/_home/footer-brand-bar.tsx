"use client"

import type { MouseEvent } from "react"
import { ArrowUp } from "lucide-react"
import type { TFunction } from "i18next"
import { StoreBadges } from "./StoreBadges"

/** The marketing type faces (the same strings home-client-helpers declares). */
const FOOTER_DISPLAY = "font-[family:var(--font-familjen)]"
export const FOOTER_MONO = "font-[family:var(--font-martian)]"

/** The footer's Company column — the same links on every marketing page. */
export function footerCompanyLinks(t: TFunction) {
  return [
    { label: t("home.footer.linkSignIn"), href: "/login" },
    { label: t("home.footer.linkHelp", "Help Center"), href: "/help" },
    { label: t("home.footer.linkBlog", "Blog"), href: "/blog" },
  ]
}

/** The footer's Legal column. */
export function footerLegalLinks(t: TFunction) {
  return [
    { label: t("home.footer.linkPrivacy"), href: "/privacy" },
    { label: t("home.footer.linkTerms"), href: "/terms" },
  ]
}

/**
 * The bottom of the marketing footer — the oversized brand mark with the app
 * badges, then the copyright and "back to top". Drawn the same on the home page
 * and every other marketing page (blog, industries…), so it is one component;
 * only the link columns above it differ (home scrolls in place, the rest link).
 */
export function FooterBrandBar({ t, onBackToTop }: { t: TFunction; onBackToTop: (e: MouseEvent) => void }) {
  return (
    <>
      {/* oversized brand accent + app badges on one line */}
      <div className="mt-14 flex flex-wrap items-end justify-between gap-x-10 gap-y-8">
        <span
          aria-hidden
          className={
            `${FOOTER_DISPLAY} pointer-events-none select-none whitespace-nowrap ` +
            "text-[clamp(4rem,17vw,15rem)] font-normal leading-[0.78] tracking-[-0.04em] text-foreground/[0.045]"
          }
        >
          HBCField
        </span>
        <div className="shrink-0 pb-2">
          <div className={`${FOOTER_MONO} mb-3 text-[10px] uppercase tracking-[0.28em] text-foreground/30`}>
            {t("home.footer.linkGetApp")}
          </div>
          <StoreBadges />
        </div>
      </div>

      {/* bottom bar */}
      <div className="flex flex-col items-center justify-between gap-4 border-t border-foreground/[0.06] py-8 sm:flex-row">
        <div className={`${FOOTER_MONO} text-[11px] uppercase tracking-[0.15em] text-foreground/30`}>
          © {new Date().getFullYear()} HBCField {t("home.footer.copyrightSuffix")}
        </div>
        <button
          type="button"
          onClick={onBackToTop}
          className={
            `${FOOTER_MONO} group inline-flex items-center gap-2 text-[11px] uppercase ` +
            "tracking-[0.2em] text-foreground/40 transition-colors hover:text-foreground"
          }
        >
          {t("home.footer.backToTop")}
          <ArrowUp className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
        </button>
      </div>
    </>
  )
}
