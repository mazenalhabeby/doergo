"use client"

import Link from "next/link"
import { ArrowLeft, Printer, Scale, Receipt, Mail, Globe, LifeBuoy } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { AnimatedLogo } from "@hbcfield/shared/components"
import { LanguageSwitcher } from "@/components/language-switcher"
import { cn } from "@/lib/utils"

const SECTION_IDS = Array.from({ length: 16 }, (_, i) => `s${i + 1}`)

export default function TermsPage() {
  const { t } = useTranslation()
  const [active, setActive] = useState("s1")

  // Highlight the section currently in view in the table of contents.
  useEffect(() => {
    const els = SECTION_IDS.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[]
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
  }, [])

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
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-1.5 text-[13px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
            >
              <ArrowLeft className="size-3.5" />
              {t("terms.backToHbcfield")}
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
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 shadow-sm">
            <Scale className="size-3.5 text-blue-600" />
            {t("terms.lastUpdated")}
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-900 sm:text-[3.25rem] sm:leading-[1.05]">
            {t("terms.title")}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-500">{t("terms.subtitle")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-slate-700"
            >
              <Printer className="size-3.5" />
              {t("terms.print", "Print / Save as PDF")}
            </button>
            <a
              href="mailto:office@hbcfield.com"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-[13px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
            >
              <Mail className="size-3.5" />
              office@hbcfield.com
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
                {t("terms.contents", "Contents")}
              </div>
              <ul className="border-l border-slate-200">
                {SECTION_IDS.map((id, i) => (
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
                      <span>{t(`terms.${id}.title`)}</span>
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
              "[&_p]:my-4 [&_p]:leading-[1.75] [&_p]:text-slate-600",
              "[&_h2]:mt-14 [&_h2]:mb-5 [&_h2]:scroll-mt-28 [&_h2]:border-t [&_h2]:border-slate-100 [&_h2]:pt-8 [&_h2]:text-[1.6rem] [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-slate-900",
              "[&_h3]:mb-2.5 [&_h3]:mt-8 [&_h3]:text-[12px] [&_h3]:font-semibold [&_h3]:uppercase [&_h3]:tracking-[0.1em] [&_h3]:text-slate-500",
              "[&_ul]:my-4 [&_ul]:list-disc [&_ul]:space-y-2.5 [&_ul]:pl-5",
              "[&_ul_ul]:mb-1 [&_ul_ul]:mt-2.5 [&_ul_ul]:space-y-1.5",
              "[&_li]:pl-1.5 [&_li]:leading-[1.7] [&_li]:text-slate-600 [&_li]:marker:text-slate-300",
              "[&_a]:font-medium [&_a]:text-blue-600 hover:[&_a]:underline",
              "[&_strong]:font-semibold [&_strong]:text-slate-900",
            )}
          >
            <p className="!text-lg !leading-relaxed !text-slate-500">{t("terms.intro")}</p>

            {/* 1. Agreement */}
            <h2 id="s1">{t("terms.s1.title")}</h2>
            <p>{t("terms.s1.p1")}</p>
            <p>{t("terms.s1.p2")}</p>

            {/* 2. Definitions */}
            <h2 id="s2">{t("terms.s2.title")}</h2>
            <p>{t("terms.s2.intro")}</p>
            <ul>
              <li><strong>{t("terms.s2.serviceLabel")}</strong>{t("terms.s2.serviceText")}</li>
              <li><strong>{t("terms.s2.orgLabel")}</strong>{t("terms.s2.orgText")}</li>
              <li><strong>{t("terms.s2.adminLabel")}</strong>{t("terms.s2.adminText")}</li>
              <li><strong>{t("terms.s2.memberLabel")}</strong>{t("terms.s2.memberText")}</li>
              <li><strong>{t("terms.s2.seatLabel")}</strong>{t("terms.s2.seatText")}</li>
              <li><strong>{t("terms.s2.dataLabel")}</strong>{t("terms.s2.dataText")}</li>
            </ul>

            {/* 3. Service & Licence */}
            <h2 id="s3">{t("terms.s3.title")}</h2>
            <p>{t("terms.s3.intro")}</p>
            <p>{t("terms.s3.licence")}</p>
            <h3>{t("terms.s3.restrictTitle")}</h3>
            <ul>
              <li>{t("terms.s3.restrict1")}</li>
              <li>{t("terms.s3.restrict2")}</li>
              <li>{t("terms.s3.restrict3")}</li>
              <li>{t("terms.s3.restrict4")}</li>
            </ul>

            {/* 4. Accounts */}
            <h2 id="s4">{t("terms.s4.title")}</h2>
            <p>{t("terms.s4.intro")}</p>
            <ul>
              <li>{t("terms.s4.item1")}</li>
              <li>{t("terms.s4.item2")}</li>
              <li>{t("terms.s4.item3")}</li>
              <li>{t("terms.s4.item4")}</li>
            </ul>

            {/* 5. Subscriptions, Seats & Plans */}
            <h2 id="s5">{t("terms.s5.title")}</h2>
            <p>{t("terms.s5.intro")}</p>
            <p>{t("terms.s5.seats")}</p>

            {/* plan callout */}
            <div className="not-prose my-8 overflow-hidden rounded-2xl border border-blue-200/70 bg-blue-50/60">
              <div className="flex items-center gap-2.5 border-b border-blue-200/60 bg-blue-50 px-6 py-4">
                <span className="flex size-8 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600">
                  <Receipt className="size-4" />
                </span>
                <h4 className="m-0 text-[15px] font-semibold text-blue-950">{t("terms.s5.plansTitle")}</h4>
              </div>
              {/*
                These three ARE the bill. The section used to list Starter €29 /
                Professional €59 / Business €99 and an office-vs-field seat
                split — tiers the product stopped selling, in the document that
                states what a customer is agreeing to pay.
              */}
              <ul className="space-y-2.5 px-6 py-5 text-[15px] text-blue-900/90">
                <li className="flex gap-2">
                  <span className="font-semibold text-blue-700">{t("terms.s5.seatLabel")}</span>
                  <span>{t("terms.s5.seatText")}</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-blue-700">{t("terms.s5.moduleLabel")}</span>
                  <span>{t("terms.s5.moduleText")}</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-blue-700">{t("terms.s5.addOnLabel")}</span>
                  <span>{t("terms.s5.addOnText")}</span>
                </li>
              </ul>
              <div className="border-t border-blue-200/60 px-6 py-4 text-[13px] text-blue-900/70">
                {t("terms.s5.plansNote")}
              </div>
            </div>

            {/* 6. Fees, Billing & Proration */}
            <h2 id="s6">{t("terms.s6.title")}</h2>
            <p>{t("terms.s6.intro")}</p>
            <ul>
              <li>
                <strong>{t("terms.s6.monthlyLabel")}</strong>
                {t("terms.s6.monthlyText")}
              </li>
              <li>
                <strong>{t("terms.s6.decreaseLabel")}</strong>
                {t("terms.s6.decreaseText")}
              </li>
            </ul>
            <p>{t("terms.s6.processor")}</p>

            {/* 7. Taxes */}
            <h2 id="s7">{t("terms.s7.title")}</h2>
            <p>{t("terms.s7.intro")}</p>
            <p>{t("terms.s7.vatId")}</p>

            {/* 8. Free Trial */}
            <h2 id="s8">{t("terms.s8.title")}</h2>
            <p>{t("terms.s8.intro")}</p>
            <p>{t("terms.s8.expiry")}</p>

            {/* 9. Renewal, Cancellation & Refunds */}
            <h2 id="s9">{t("terms.s9.title")}</h2>
            <ul>
              <li>
                <strong>{t("terms.s9.renewLabel")}</strong>
                {t("terms.s9.renewText")}
              </li>
              <li>
                <strong>{t("terms.s9.cancelLabel")}</strong>
                {t("terms.s9.cancelText")}
              </li>
              <li>
                <strong>{t("terms.s9.refundLabel")}</strong>
                {t("terms.s9.refundText")}
              </li>
              <li>
                <strong>{t("terms.s9.failLabel")}</strong>
                {t("terms.s9.failText")}
              </li>
            </ul>

            {/* 10. Acceptable Use */}
            <h2 id="s10">{t("terms.s10.title")}</h2>
            <p>{t("terms.s10.intro")}</p>
            <ul>
              <li>{t("terms.s10.item1")}</li>
              <li>{t("terms.s10.item2")}</li>
              <li>{t("terms.s10.item3")}</li>
              <li>{t("terms.s10.item4")}</li>
              <li>{t("terms.s10.item5")}</li>
              <li>{t("terms.s10.item6")}</li>
            </ul>

            {/* 11. Customer Data & Privacy */}
            <h2 id="s11">{t("terms.s11.title")}</h2>
            <p>{t("terms.s11.ownership")}</p>
            <p>
              {t("terms.s11.privacyPre")}
              <Link href="/privacy">{t("terms.s11.privacyLink")}</Link>
              {t("terms.s11.privacyPost")}
            </p>
            <p>{t("terms.s11.export")}</p>

            {/* 12. Intellectual Property */}
            <h2 id="s12">{t("terms.s12.title")}</h2>
            <p>{t("terms.s12.ownership")}</p>
            <p>{t("terms.s12.feedback")}</p>

            {/* 13. Third-Party Services */}
            <h2 id="s13">{t("terms.s13.title")}</h2>
            <p>{t("terms.s13.intro")}</p>
            <ul>
              <li><strong>{t("terms.s13.stripeLabel")}</strong>{t("terms.s13.stripeText")}</li>
              <li><strong>{t("terms.s13.hostingLabel")}</strong>{t("terms.s13.hostingText")}</li>
              <li><strong>{t("terms.s13.pushLabel")}</strong>{t("terms.s13.pushText")}</li>
              <li><strong>{t("terms.s13.mapsLabel")}</strong>{t("terms.s13.mapsText")}</li>
            </ul>

            {/* 14. Warranties, Availability & Liability */}
            <h2 id="s14">{t("terms.s14.title")}</h2>
            <p>{t("terms.s14.availability")}</p>
            <p>{t("terms.s14.asis")}</p>
            <p>{t("terms.s14.liability")}</p>
            <p>{t("terms.s14.mandatory")}</p>

            {/* 15. Term, Suspension & Termination */}
            <h2 id="s15">{t("terms.s15.title")}</h2>
            <p>{t("terms.s15.term")}</p>
            <p>{t("terms.s15.suspend")}</p>
            <p>{t("terms.s15.effect")}</p>

            {/* 16. Governing Law, Changes & Contact */}
            <h2 id="s16">{t("terms.s16.title")}</h2>
            <p>{t("terms.s16.law")}</p>
            <p>{t("terms.s16.changes")}</p>

            {/* contact card */}
            <div className="not-prose my-8 rounded-2xl border border-slate-200 bg-slate-50/70 p-6">
              <p className="mb-4 text-base font-semibold text-slate-900">{t("terms.s16.company")}</p>
              <ul className="space-y-3 text-[15px]">
                <li className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
                    <Mail className="size-4" />
                  </span>
                  <span className="text-slate-500">
                    {t("terms.s16.emailLabel")}
                    <a href="mailto:office@hbcfield.com" className="font-medium text-blue-600 hover:underline">
                      office@hbcfield.com
                    </a>
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
                    <Globe className="size-4" />
                  </span>
                  <span className="text-slate-500">
                    {t("terms.s16.websiteLabel")}
                    <a href="https://hbcfield.com" className="font-medium text-blue-600 hover:underline">
                      https://hbcfield.com
                    </a>
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
                    <LifeBuoy className="size-4" />
                  </span>
                  <span className="text-slate-500">
                    {t("terms.s16.supportLabel")}
                    <a href="mailto:support@hbcfield.com" className="font-medium text-blue-600 hover:underline">
                      support@hbcfield.com
                    </a>
                  </span>
                </li>
              </ul>
            </div>
          </article>
        </div>
      </div>

      {/* ── footer ── */}
      <footer className="border-t border-slate-200/70 print:hidden">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-slate-400 sm:flex-row">
          <span>
            &copy; {new Date().getFullYear()} {t("terms.footerRights")}
          </span>
          <Link href="/" className="font-medium text-slate-500 transition-colors hover:text-slate-900">
            {t("terms.backToHbcfield")}
          </Link>
        </div>
      </footer>
    </div>
  )
}
