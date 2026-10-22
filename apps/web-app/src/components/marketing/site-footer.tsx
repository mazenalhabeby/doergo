"use client"

import Link from "next/link"
import { useTranslation } from "react-i18next"
import { ArrowUpRight } from "lucide-react"
import { AnimatedLogo } from "@hbcfield/shared/components"
import { FOOTER_MONO as MONO, FooterBrandBar, footerCompanyLinks, footerLegalLinks } from "@/components/marketing/footer-brand-bar"

/**
 * The main marketing footer, reusable on pages other than home (blog,
 * industries, …). Identical structure/copy to the home footer; the Explore
 * links route to the home sections (`/#work` …) instead of smooth-scrolling.
 */
export function SiteFooter() {
  const { t } = useTranslation()

  const backToTop = () => window.scrollTo({ top: 0, behavior: "smooth" })

  return (
    <footer className="relative overflow-hidden border-t border-foreground/[0.08] px-6 pt-20 sm:px-10">
      <div className="mx-auto max-w-[1600px]">
        {/* brand + links */}
        <div className="flex flex-col gap-14 lg:flex-row lg:justify-between lg:gap-12">
          <div className="max-w-sm">
            <AnimatedLogo size="small" variant="light" />
            <p className="mt-6 text-[15px] leading-relaxed text-foreground/45">{t("home.footer.tagline")}</p>
            <a
              href="mailto:office@hbcfield.com"
              className={(`${MONO} group mt-7 inline-flex items-center gap-2 border-b ` +
                `border-foreground/25 pb-1 text-[12px] tracking-[0.12em] ` +
                `text-foreground/70 transition-colors hover:border-foreground ` +
                `hover:text-foreground`)}
            >
              office@hbcfield.com
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:gap-20">
            <FooterCol
              title={t("home.footer.explore")}
              links={[
                { label: t("home.footer.linkPlatform"), href: "/#work" },
                { label: t("home.footer.linkProcess"), href: "/#how" },
                { label: t("home.footer.linkApp"), href: "/#field" },
                { label: t("home.footer.linkPricing"), href: "/#pricing" },
                { label: t("home.footer.linkGetStarted"), href: "/#contact" },
              ]}
            />
            <FooterCol title={t("home.footer.company")} links={footerCompanyLinks(t)} />
            <FooterCol title={t("home.footer.legal")} links={footerLegalLinks(t)} />
          </div>
        </div>

        <FooterBrandBar t={t} onBackToTop={backToTop} />
      </div>
    </footer>
  )
}

function FooterCol({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  const linkCls = "text-[14px] text-foreground/55 transition-colors hover:text-foreground"
  return (
    <div>
      <div className={`${MONO} mb-5 text-[10px] uppercase tracking-[0.28em] text-foreground/30`}>{title}</div>
      <ul className="space-y-3">
        {links.map((l) => (
          <li key={l.label}>
            <Link href={l.href} className={linkCls}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
