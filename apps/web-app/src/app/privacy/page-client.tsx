"use client"

import Link from "next/link"
import { ArrowLeft, Printer, ShieldCheck, MapPin, Mail, Globe, LifeBuoy } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { AnimatedLogo } from "@hbcfield/shared/components"
import { LanguageSwitcher } from "@/components/language-switcher"
import { cn } from "@/lib/utils"

const SECTION_IDS = Array.from({ length: 13 }, (_, i) => `s${i + 1}`)

export default function PrivacyPolicyPage() {
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
              {t("privacy.backToHbcfield")}
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
            <ShieldCheck className="size-3.5 text-blue-600" />
            {t("privacy.lastUpdated")}
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-900 sm:text-[3.25rem] sm:leading-[1.05]">
            {t("privacy.title")}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-500">{t("privacy.subtitle")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-slate-700"
            >
              <Printer className="size-3.5" />
              {t("privacy.print", "Print / Save as PDF")}
            </button>
            <a
              href="mailto:privacy@hbcfield.com"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-[13px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
            >
              <Mail className="size-3.5" />
              privacy@hbcfield.com
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
                {t("privacy.contents", "Contents")}
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
                      <span>{t(`privacy.${id}.title`)}</span>
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
              "[&_h2]:mt-14 [&_h2]:mb-5 [&_h2]:scroll-mt-28 [&_h2]:border-t [&_h2]:border-slate-100 [&_h2]:pt-8 [&_h2]:text-[1.6rem] [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-slate-900",
              // sub-headings (h3)
              "[&_h3]:mb-2.5 [&_h3]:mt-8 [&_h3]:text-[12px] [&_h3]:font-semibold [&_h3]:uppercase [&_h3]:tracking-[0.1em] [&_h3]:text-slate-500",
              // lists
              "[&_ul]:my-4 [&_ul]:list-disc [&_ul]:space-y-2.5 [&_ul]:pl-5",
              "[&_ul_ul]:mb-1 [&_ul_ul]:mt-2.5 [&_ul_ul]:space-y-1.5",
              "[&_li]:pl-1.5 [&_li]:leading-[1.7] [&_li]:text-slate-600 [&_li]:marker:text-slate-300",
              // inline
              "[&_a]:font-medium [&_a]:text-blue-600 hover:[&_a]:underline",
              "[&_strong]:font-semibold [&_strong]:text-slate-900",
            )}
          >
            <p className="!text-lg !leading-relaxed !text-slate-500">{t("privacy.intro")}</p>

            <h2 id="s1">{t("privacy.s1.title")}</h2>

            <h3>{t("privacy.s1.accountTitle")}</h3>
            <ul>
              <li>{t("privacy.s1.accountEmail")}</li>
              <li>{t("privacy.s1.accountName")}</li>
              <li>{t("privacy.s1.accountOrg")}</li>
              <li>{t("privacy.s1.accountRole")}</li>
            </ul>

            <h3>{t("privacy.s1.locationTitle")}</h3>
            <ul>
              <li>
                <strong>{t("privacy.s1.gpsLabel")}</strong>
                {t("privacy.s1.gpsIntro")}
                <ul>
                  <li>{t("privacy.s1.gps1")}</li>
                  <li>{t("privacy.s1.gps2")}</li>
                  <li>{t("privacy.s1.gps3")}</li>
                </ul>
              </li>
              <li>
                <strong>{t("privacy.s1.cachedLabel")}</strong>
                {t("privacy.s1.cachedText")}
              </li>
              <li>
                {t("privacy.s1.neverPre")}
                <strong>{t("privacy.s1.neverBold")}</strong>
                {t("privacy.s1.neverPost")}
              </li>
            </ul>

            <h3>{t("privacy.s1.workTitle")}</h3>
            <ul>
              <li>{t("privacy.s1.work1")}</li>
              <li>{t("privacy.s1.work2")}</li>
              <li>{t("privacy.s1.work3")}</li>
              <li>{t("privacy.s1.work4")}</li>
            </ul>

            <h3>{t("privacy.s1.deviceTitle")}</h3>
            <ul>
              <li>{t("privacy.s1.device1")}</li>
              <li>{t("privacy.s1.device2")}</li>
              <li>{t("privacy.s1.device3")}</li>
            </ul>

            <h2 id="s2">{t("privacy.s2.title")}</h2>
            <ul>
              <li>{t("privacy.s2.item1")}</li>
              <li>{t("privacy.s2.item2")}</li>
              <li>{t("privacy.s2.item3")}</li>
              <li>{t("privacy.s2.item4")}</li>
              <li>{t("privacy.s2.item5")}</li>
              <li>{t("privacy.s2.item6")}</li>
              <li>{t("privacy.s2.item7")}</li>
              <li>{t("privacy.s2.item8")}</li>
            </ul>

            <h2 id="s3">{t("privacy.s3.title")}</h2>
            <p>{t("privacy.s3.intro")}</p>
            <ul>
              <li>
                <strong>{t("privacy.s3.contractLabel")}</strong>
                {t("privacy.s3.contractText")}
              </li>
              <li>
                <strong>{t("privacy.s3.legitLabel")}</strong>
                {t("privacy.s3.legitText")}
              </li>
              <li>
                <strong>{t("privacy.s3.consentLabel")}</strong>
                {t("privacy.s3.consentText")}
              </li>
              <li>
                <strong>{t("privacy.s3.legalLabel")}</strong>
                {t("privacy.s3.legalText")}
              </li>
            </ul>

            <h2 id="s4">{t("privacy.s4.title")}</h2>
            <ul>
              <li>
                {t("privacy.s4.noSellPre")}
                <strong>{t("privacy.s4.noSellBold")}</strong>
                {t("privacy.s4.noSellPost")}
              </li>
              <li>{t("privacy.s4.internal")}</li>
              <li>
                {t("privacy.s4.thirdPartyIntro")}
                <ul>
                  <li>
                    <strong>{t("privacy.s4.expoLabel")}</strong>
                    {t("privacy.s4.expoText")}
                  </li>
                  <li>
                    <strong>{t("privacy.s4.fcmLabel")}</strong>
                    {t("privacy.s4.fcmText")}
                  </li>
                  <li>
                    <strong>{t("privacy.s4.apnsLabel")}</strong>
                    {t("privacy.s4.apnsText")}
                  </li>
                  <li>
                    <strong>{t("privacy.s4.hetznerCloudLabel")}</strong>
                    {t("privacy.s4.hetznerCloudText")}
                  </li>
                  <li>
                    <strong>{t("privacy.s4.hetznerStorageLabel")}</strong>
                    {t("privacy.s4.hetznerStorageText")}
                  </li>
                  <li>
                    <strong>{t("privacy.s4.osmLabel")}</strong>
                    {t("privacy.s4.osmText")}
                  </li>
                  <li>
                    <strong>{t("privacy.s4.nominatimLabel")}</strong>
                    {t("privacy.s4.nominatimText")}
                  </li>
                </ul>
              </li>
            </ul>

            <h2 id="s5">{t("privacy.s5.title")}</h2>
            <ul>
              <li>
                {t("privacy.s5.euPre")}
                <strong>{t("privacy.s5.euBold")}</strong>
                {t("privacy.s5.euPost")}
              </li>
              <li>{t("privacy.s5.item2")}</li>
              <li>{t("privacy.s5.item3")}</li>
              <li>{t("privacy.s5.item4")}</li>
              <li>{t("privacy.s5.item5")}</li>
              <li>{t("privacy.s5.item6")}</li>
              <li>{t("privacy.s5.item7")}</li>
              <li>{t("privacy.s5.item8")}</li>
              <li>{t("privacy.s5.item9")}</li>
            </ul>

            <h2 id="s6">{t("privacy.s6.title")}</h2>
            <ul>
              <li>{t("privacy.s6.item1")}</li>
              <li>{t("privacy.s6.item2")}</li>
              <li>{t("privacy.s6.item3")}</li>
              <li>{t("privacy.s6.item4")}</li>
              <li>{t("privacy.s6.item5")}</li>
            </ul>

            <h2 id="s7">{t("privacy.s7.title")}</h2>
            <p>{t("privacy.s7.intro")}</p>
            <ul>
              <li>
                <strong>{t("privacy.s7.accessLabel")}</strong>
                {t("privacy.s7.accessText")}
              </li>
              <li>
                <strong>{t("privacy.s7.rectificationLabel")}</strong>
                {t("privacy.s7.rectificationText")}
              </li>
              <li>
                <strong>{t("privacy.s7.erasureLabel")}</strong>
                {t("privacy.s7.erasureText")}
              </li>
              <li>
                <strong>{t("privacy.s7.portabilityLabel")}</strong>
                {t("privacy.s7.portabilityText")}
              </li>
              <li>
                <strong>{t("privacy.s7.objectLabel")}</strong>
                {t("privacy.s7.objectText")}
              </li>
              <li>
                <strong>{t("privacy.s7.restrictLabel")}</strong>
                {t("privacy.s7.restrictText")}
              </li>
              <li>
                <strong>{t("privacy.s7.withdrawLabel")}</strong>
                {t("privacy.s7.withdrawText")}
              </li>
              <li>
                <strong>{t("privacy.s7.complaintLabel")}</strong>
                {t("privacy.s7.complaintText")}
              </li>
            </ul>
            <p>
              {t("privacy.s7.contactPre")}
              <a href="mailto:privacy@hbcfield.com">privacy@hbcfield.com</a>
              {t("privacy.s7.contactPost")}
            </p>

            <h2 id="s8">{t("privacy.s8.title")}</h2>
            <p>{t("privacy.s8.intro")}</p>

            {/* GPS behaviour callout */}
            <div className="not-prose my-8 overflow-hidden rounded-2xl border border-blue-200/70 bg-blue-50/60">
              <div className="flex items-center gap-2.5 border-b border-blue-200/60 bg-blue-50 px-6 py-4">
                <span className="flex size-8 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600">
                  <MapPin className="size-4" />
                </span>
                <h4 className="m-0 text-[15px] font-semibold text-blue-950">{t("privacy.s8.gpsActiveTitle")}</h4>
              </div>
              <ul className="space-y-2.5 px-6 py-5 text-[15px] text-blue-900/90">
                <li className="flex gap-2">
                  <span className="font-semibold text-blue-700">{t("privacy.s8.drivingLabel")}</span>
                  <span>{t("privacy.s8.drivingText")}</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-blue-700">{t("privacy.s8.clockLabel")}</span>
                  <span>{t("privacy.s8.clockText")}</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-blue-700">{t("privacy.s8.arrivingLabel")}</span>
                  <span>{t("privacy.s8.arrivingText")}</span>
                </li>
              </ul>
              <div className="border-t border-blue-200/60 px-6 py-5">
                <h4 className="m-0 mb-2.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-blue-700/80">
                  {t("privacy.s8.gpsInactiveTitle")}
                </h4>
                <ul className="space-y-1.5 text-[15px] text-blue-900/80">
                  <li>{t("privacy.s8.inactive1")}</li>
                  <li>{t("privacy.s8.inactive2")}</li>
                  <li>{t("privacy.s8.inactive3")}</li>
                </ul>
              </div>
            </div>

            <p>{t("privacy.s8.safeguardsIntro")}</p>
            <ul>
              <li>{t("privacy.s8.safeguard1")}</li>
              <li>{t("privacy.s8.safeguard2")}</li>
              <li>{t("privacy.s8.safeguard3")}</li>
              <li>{t("privacy.s8.safeguard4")}</li>
            </ul>

            <h2 id="s9">{t("privacy.s9.title")}</h2>
            <p>{t("privacy.s9.intro")}</p>
            <ul>
              <li>{t("privacy.s9.item1")}</li>
              <li>{t("privacy.s9.item2")}</li>
              <li>{t("privacy.s9.item3")}</li>
              <li>{t("privacy.s9.item4")}</li>
              <li>{t("privacy.s9.item5")}</li>
            </ul>
            <p>{t("privacy.s9.disable")}</p>

            <h2 id="s10">{t("privacy.s10.title")}</h2>
            <p>{t("privacy.s10.body")}</p>

            <h2 id="s11">{t("privacy.s11.title")}</h2>
            <p>{t("privacy.s11.body")}</p>

            <h2 id="s12">{t("privacy.s12.title")}</h2>
            <p>{t("privacy.s12.body")}</p>

            <h2 id="s13">{t("privacy.s13.title")}</h2>
            {/* contact card */}
            <div className="not-prose my-8 rounded-2xl border border-slate-200 bg-slate-50/70 p-6">
              <p className="mb-4 text-base font-semibold text-slate-900">{t("privacy.s13.company")}</p>
              <ul className="space-y-3 text-[15px]">
                <li className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
                    <Mail className="size-4" />
                  </span>
                  <span className="text-slate-500">
                    {t("privacy.s13.emailLabel")}
                    <a href="mailto:privacy@hbcfield.com" className="font-medium text-blue-600 hover:underline">
                      privacy@hbcfield.com
                    </a>
                  </span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
                    <Globe className="size-4" />
                  </span>
                  <span className="text-slate-500">
                    {t("privacy.s13.websiteLabel")}
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
                    {t("privacy.s13.supportLabel")}
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
            &copy; {new Date().getFullYear()} {t("privacy.footerRights")}
          </span>
          <Link href="/" className="font-medium text-slate-500 transition-colors hover:text-slate-900">
            {t("privacy.backToHbcfield")}
          </Link>
        </div>
      </footer>
    </div>
  )
}
