"use client"

import { ArrowUpRight } from "lucide-react"
import { AnimatedLogo } from "@hbcfield/shared/components"
import { FooterBrandBar, footerCompanyLinks, footerLegalLinks } from "./footer-brand-bar"
import { MONO, FooterCol } from "./home-client-helpers"
import type { HomeClientState } from "./use-home-client"

/** Part of HomeClient's markup, moved here unchanged; it reads the page's state from `vm`. */
export function HomeClientFooter({ vm }: { vm: HomeClientState }) {
  const { t, navTo, backToTop } = vm
  return (
    <footer className="relative overflow-hidden border-t border-foreground/[0.08] px-6 pt-20 sm:px-10">
      <div className="mx-auto max-w-[1600px]">
        {/* brand + links */}
        <div className="flex flex-col gap-14 lg:flex-row lg:justify-between lg:gap-12">
          {/* brand + contact */}
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

          {/* link columns */}
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:gap-20">
            <FooterCol
              title={t("home.footer.explore")}
              links={[
                { label: t("home.footer.linkPlatform"), href: "#work", onClick: navTo("#work") },
                { label: t("home.footer.linkProcess"), href: "#how", onClick: navTo("#how") },
                { label: t("home.footer.linkApp"), href: "#field", onClick: navTo("#field") },
                { label: t("home.footer.linkPricing"), href: "#pricing", onClick: navTo("#pricing") },
                { label: t("home.footer.linkGetStarted"), href: "#contact", onClick: navTo("#contact") },
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
