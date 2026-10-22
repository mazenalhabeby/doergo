"use client"

import Link from "next/link"
import { ArrowLeft, Mail, Printer } from "lucide-react"
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { AnimatedLogo } from "@hbcfield/shared/components"
import { LanguageSwitcher } from "@/components/app-shell/language-switcher"
import { cn } from "@/lib/utils"

type Icon = ComponentType<{ className?: string }>

/**
 * The frame of a legal document page (Privacy, Terms): nav, header with print
 * and contact, the table of contents that follows the reader, the styled
 * article and the footer. `ns` is the page's catalogue namespace; sections are
 * `s1`…`sN`, each with a `title` key, and the body comes in as children.
 */
export function LegalDocument({
  ns,
  sectionCount,
  badgeIcon: BadgeIcon,
  email,
  children,
}: {
  ns: "privacy" | "terms"
  sectionCount: number
  badgeIcon: Icon
  email: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  const sectionIds = useMemo(() => Array.from({ length: sectionCount }, (_, i) => `s${i + 1}`), [sectionCount])
  const [active, setActive] = useState("s1")

  // Highlight the section currently in view in the table of contents.
  useEffect(() => {
    const els = sectionIds.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[]
    if (!els.length) return
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: "-100px 0px -68% 0px", threshold: 0 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [sectionIds])

  return (
    <div className="min-h-screen bg-white text-slate-600 [color-scheme:light]">
      {/* ── top nav ── */}
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Link href="/" aria-label="HBCField home" className="flex items-center">
            <AnimatedLogo size="small" />
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              href="/"
              className={"inline-flex items-center gap-1.5 rounded-full border border-slate-200 " +
                "px-3.5 py-1.5 text-[13px] font-medium text-slate-600 transition-colors " +
                "hover:border-slate-300 hover:text-slate-900"}
            >
              <ArrowLeft className="size-3.5" />
              {t(`${ns}.backToHbcfield`)}
            </Link>
          </div>
        </div>
      </header>

      {/* ── document header ── */}
      <div className="relative overflow-hidden border-b border-slate-200/70 bg-gradient-to-b from-slate-50 to-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              "radial-gradient(60rem 30rem at 85% -20%, rgba(37,99,235,0.06), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <span
            className={"inline-flex items-center gap-2 rounded-full border border-slate-200 " +
              "bg-white px-3 py-1 text-xs font-medium text-slate-500 shadow-sm"}>
            <BadgeIcon className="size-3.5 text-blue-600" />
            {t(`${ns}.lastUpdated`)}
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-900 sm:text-[3.25rem] sm:leading-[1.05]">
            {t(`${ns}.title`)}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-500">{t(`${ns}.subtitle`)}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className={"inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 " +
                "text-[13px] font-medium text-white transition-colors hover:bg-slate-700"}
            >
              <Printer className="size-3.5" />
              {t(`${ns}.print`, "Print / Save as PDF")}
            </button>
            <a
              href={`mailto:${email}`}
              className={"inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 " +
                "py-2 text-[13px] font-medium text-slate-600 transition-colors " +
                "hover:border-slate-300 hover:text-slate-900"}
            >
              <Mail className="size-3.5" />
              {email}
            </a>
          </div>
        </div>
      </div>

      {/* ── body: TOC + content ── */}
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="lg:grid lg:grid-cols-[224px_minmax(0,1fr)] lg:gap-16">
          {/* table of contents */}
          <aside className="hidden lg:block print:hidden">
            <nav className="sticky top-24">
              <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                {t(`${ns}.contents`, "Contents")}
              </div>
              <ul className="border-l border-slate-200">
                {sectionIds.map((id, i) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      className={cn(
                        "-ml-px flex gap-2 border-l-2 py-1.5 pl-4 text-[13px] leading-snug transition-colors",
                        active === id
                          ? "border-blue-600 font-medium text-blue-700"
                          : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
                      )}
                    >
                      <span className="tabular-nums text-slate-400">{String(i + 1).padStart(2, "0")}</span>
                      <span>{t(`${ns}.${id}.title`)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          {/* content */}
          <article
            className={cn(
              "max-w-none text-[15px] text-slate-600",
              // paragraphs
              "[&_p]:my-4 [&_p]:leading-[1.75] [&_p]:text-slate-600",
              // section headings (h2)
              ("[&_h2]:mt-14 [&_h2]:mb-5 [&_h2]:scroll-mt-28 [&_h2]:border-t " +
                "[&_h2]:border-slate-100 [&_h2]:pt-8 [&_h2]:text-[1.6rem] " +
                "[&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-slate-900"),
              // sub-headings (h3)
              ("[&_h3]:mb-2.5 [&_h3]:mt-8 [&_h3]:text-[12px] [&_h3]:font-semibold " +
                "[&_h3]:uppercase [&_h3]:tracking-[0.1em] [&_h3]:text-slate-500"),
              // lists
              "[&_ul]:my-4 [&_ul]:list-disc [&_ul]:space-y-2.5 [&_ul]:pl-5",
              "[&_ul_ul]:mb-1 [&_ul_ul]:mt-2.5 [&_ul_ul]:space-y-1.5",
              "[&_li]:pl-1.5 [&_li]:leading-[1.7] [&_li]:text-slate-600 [&_li]:marker:text-slate-300",
              // inline
              "[&_a]:font-medium [&_a]:text-blue-600 hover:[&_a]:underline",
              "[&_strong]:font-semibold [&_strong]:text-slate-900",
            )}
          >
            <p className="!text-lg !leading-relaxed !text-slate-500">{t(`${ns}.intro`)}</p>

            {children}
          </article>
        </div>
      </div>

      {/* ── footer ── */}
      <footer className="border-t border-slate-200/70 print:hidden">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-slate-400 sm:flex-row">
          <span>
            &copy; {new Date().getFullYear()} {t(`${ns}.footerRights`)}
          </span>
          <Link href="/" className="font-medium text-slate-500 transition-colors hover:text-slate-900">
            {t(`${ns}.backToHbcfield`)}
          </Link>
        </div>
      </footer>
    </div>
  )
}

/** The "who we are and how to reach us" card closing a legal document. */
export function LegalContactCard({
  company,
  rows,
}: {
  company: ReactNode
  rows: { icon: Icon; label: ReactNode; href: string; text: string }[]
}) {
  return (
    <div className="not-prose my-8 rounded-2xl border border-slate-200 bg-slate-50/70 p-6">
      <p className="mb-4 text-base font-semibold text-slate-900">{company}</p>
      <ul className="space-y-3 text-[15px]">
        {rows.map(({ icon: RowIcon, label, href, text }) => (
          <li key={href} className="flex items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
              <RowIcon className="size-4" />
            </span>
            <span className="text-slate-500">
              {label}
              <a href={href} className="font-medium text-blue-600 hover:underline">
                {text}
              </a>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
