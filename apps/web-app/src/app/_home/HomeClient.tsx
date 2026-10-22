"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { usePrefersReducedMotion } from "./use-reduced-motion"
import { useLenis } from "./use-lenis"
import { useScrollRestoration } from "./use-scroll-restoration"
import { LaptopShowcase } from "./LaptopShowcase"
import { PhoneShowcase } from "./PhoneShowcase"
import { DISPLAY, FramePlus } from "./home-ui"
import { HomeNav } from "./home-nav"
import { HomeHero } from "./home-hero"
import { HomePositioning, HomeIntroVideo, HomeKeyFacts, HomeHowItWorks, HomeFieldApp } from "./home-product-sections"
import { HomeWhy } from "./home-why"
import { HomeIndustries } from "./home-industries"
import { HomePricing } from "./home-pricing"
import { HomeFeatureCompare, HomeFaq, HomeContactCta } from "./home-closing-sections"
import { HomeFooter } from "./home-footer"

/* ═══════════════════════════════════════════════════════════
   Monochrome studio palette
   bg #0e1116 · text #d8d8d8 · emphasis #f2f2f0 · hairline white/8
   display: Familjen Grotesk (400) · labels: Martian Mono
   ═══════════════════════════════════════════════════════════ */

export default function HomeClient({ lang = "en" }: { lang?: string }) {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const reduced = usePrefersReducedMotion()
  // next-themes: avoid hydration mismatch on the toggle icon (server can't know theme).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  useLenis(!reduced)

  // The page is two documents — see use-scroll-restoration. `mounted` is the
  // commit in which the real prefers-reduced-motion value has been applied, so
  // it marks the point where the layout is the one the offset was measured in.
  useScrollRestoration(mounted)

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.push("/dashboard")
  }, [isLoading, isAuthenticated, router])

  return (
    <>
      <style>{`
        .reveal { opacity: 0; transform: translateY(20px); transition: opacity .8s cubic-bezier(.22,1,.36,1), transform .8s cubic-bezier(.22,1,.36,1); }
        .reveal.is-visible { opacity: 1; transform: none; }
        .lr-row { display: block; overflow: hidden; }
        .lr-in { display: block; transform: translateY(110%); transition: transform .95s cubic-bezier(.22,1,.36,1); }
        .lr.is-visible .lr-in { transform: translateY(0); }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        /* cycling word — each letter rises from behind a clip (trionn-style) */
        /* padding-bottom + equal negative margin extends the clip area below the
           baseline so descenders (g, y, p, q, j) aren't cut, without shifting layout */
        .cw-row { display: inline-block; overflow: hidden; vertical-align: bottom; padding-bottom: 0.2em; margin-bottom: -0.2em; }
        .cw-in { display: inline-block; transform: translateY(110%); animation: cw-rise .6s cubic-bezier(.22,1,.36,1) forwards; }
        @keyframes cw-rise { to { transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) {
          .reveal { opacity: 1; transform: none; transition: none; }
          .lr-in { transform: none; transition: none; }
          .cw-in { transform: none; animation: none; }
        }
      `}</style>
      <noscript>
        <style>{`.reveal{opacity:1!important;transform:none!important}.lr-in{transform:none!important}`}</style>
      </noscript>

      {/* Marketing content is ALWAYS rendered (server-side too) so crawlers and
          AI engines receive the full page — not a spinner. Authenticated users
          are redirected to /dashboard by the effect above, over the top. */}
      <div className={`min-h-screen bg-background text-foreground antialiased selection:bg-foreground/20 ${DISPLAY}`}>
        {/* corner registration marks (fixed frame) */}
        <FramePlus />

        {/* ══════ NAV ══════ */}
        <HomeNav mounted={mounted} />

        {/* ══════ HERO — always dark (explicit bg so the page theme never lightens it) ══════ */}
        <HomeHero reduced={reduced} />

        {/* ══════ POSITIONING ══════ */}
        <HomePositioning />

        {/* ══════ INTRO VIDEO ══════ */}
        <HomeIntroVideo />

        {/* ══════ KEY FACTS ══════ */}
        <HomeKeyFacts />

        {/* ══════ PRODUCT SHOWCASE — scroll-driven 3D laptop ══════ */}
        <LaptopShowcase />

        {/* ══════ HOW IT WORKS — process steps (flows with the page, no scroll-trap) ══════ */}
        <HomeHowItWorks />

        {/* ══════ FIELD / MOBILE ══════ */}
        <HomeFieldApp />

        {/* ══════ PHONE SHOWCASE — scroll-driven mobile app ══════ */}
        <PhoneShowcase />

        {/* ══════ WHY / THREE-IN-ONE + DIFFERENTIATORS ══════ */}
        <HomeWhy />

        {/* ══════ INDUSTRIES / WHO IT'S FOR ══════ */}
        <HomeIndustries lang={lang} />

        {/* ══════ PRICING ══════ */}
        <HomePricing />

        {/* ══════ FEATURE COMPARISON (code-driven) ══════ */}
        <HomeFeatureCompare />

        {/* ══════ FAQ ══════ */}
        <HomeFaq />

        {/* ══════ CTA ══════ */}
        <HomeContactCta />

        {/* ══════ FOOTER ══════ */}
        <HomeFooter />
      </div>
    </>
  )
}
