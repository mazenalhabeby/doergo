"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Check, Star, Clock, ListChecks, Camera } from "lucide-react"

import {
  APP_STORE_URL,
  GOOGLE_PLAY_URL,
  AppleGlyph,
  GooglePlayGlyph,
} from "@/app/_home/StoreBadges"

type Phone = "ios" | "android"

/** Detect an actual PHONE (not desktop, not tablet — the web app stays available
 *  on tablets). iPhone/iPod for iOS; Android UAs carry "Mobile" only on phones. */
function detectPhone(): Phone | null {
  if (typeof navigator === "undefined") return null
  const ua = navigator.userAgent || (navigator as any).vendor || ""
  if (/iphone|ipod/i.test(ua)) return "ios"
  if (/android/i.test(ua) && /mobile/i.test(ua)) return "android"
  return null
}

/**
 * On a phone the web app is NOT available — installing the native app is
 * required. This is a hard wall: no dismiss, no "continue in browser". Renders
 * nothing on desktop/tablet, where the responsive web works fine.
 */
export function MobileAppInterstitial() {
  const { t } = useTranslation()
  const [phone, setPhone] = useState<Phone | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const p = detectPhone()
    if (!p) return
    setPhone(p)
    requestAnimationFrame(() => setMounted(true))
  }, [])

  // Lock the page from scrolling behind the wall.
  useEffect(() => {
    if (!phone) return
    const prevBody = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = "hidden"
    document.documentElement.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prevBody
      document.documentElement.style.overflow = prevHtml
    }
  }, [phone])

  if (!phone) return null

  const isIOS = phone === "ios"
  const storeUrl = isIOS ? APP_STORE_URL : GOOGLE_PLAY_URL
  const otherUrl = isIOS ? GOOGLE_PLAY_URL : APP_STORE_URL
  const storeName = isIOS ? "App Store" : "Google Play"

  const benefits = [
    { icon: Clock, label: t("appPrompt.benefit1", "Clock in & out on the go with GPS") },
    { icon: ListChecks, label: t("appPrompt.benefit2", "Your tasks & updates in real time") },
    { icon: Camera, label: t("appPrompt.benefit3", "Snap photos & work offline in the field") },
  ]

  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto overflow-x-hidden bg-background">
      {/* Brand-tinted depth — soft glows, subtle in both themes */}
      <div className="pointer-events-none absolute -left-24 -top-28 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-blue-600/20 blur-3xl" />

      <div className="relative flex min-h-full flex-col items-center justify-center px-6 py-14">
        <div
          className={`w-full max-w-[360px] text-center transition-all duration-500 ease-out motion-reduce:transition-none ${
            mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
        >
          {/* Authentic app-icon squircle — the real brand mark on white */}
          <div className="mx-auto flex h-[76px] w-[76px] items-center justify-center rounded-[22px] bg-white shadow-[0_12px_30px_-8px_rgba(0,0,0,0.35)] ring-1 ring-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.svg" alt="" className="h-11 w-11" />
          </div>

          {/* Trust cue */}
          <div className="mt-5 flex items-center justify-center gap-2">
            <div className="flex text-amber-400">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-3.5 w-3.5 fill-current" />
              ))}
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              {t("appPrompt.freeOn", "Free on {{store}}", { store: storeName })}
            </span>
          </div>

          <h1 className="mt-4 text-[26px] font-bold leading-[1.15] tracking-tight text-foreground text-balance">
            {t("appPrompt.titleRequired", "Get the HBCField app")}
          </h1>
          <p className="mx-auto mt-2.5 max-w-[300px] text-[15px] leading-relaxed text-muted-foreground text-pretty">
            {t("appPrompt.subtitleRequired", "On your phone, HBCField runs in the app. Install it to continue — on a computer or tablet, use the web.")}
          </p>

          {/* Benefits card */}
          <div className="mt-7 space-y-3 rounded-2xl border border-border/70 bg-card/70 p-4 text-left shadow-sm backdrop-blur">
            {benefits.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-blue-600/15 text-foreground">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{label}</span>
                <Check className="h-4 w-4 shrink-0 text-emerald-500" />
              </div>
            ))}
          </div>

          {/* Primary CTA — the detected store (the only way forward on a phone) */}
          <a
            href={storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-7 flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-black text-white shadow-lg shadow-black/20 transition-transform active:scale-[0.98]"
          >
            {isIOS ? <AppleGlyph className="h-6 w-6" /> : <GooglePlayGlyph className="h-6 w-6" />}
            <span className="flex flex-col items-start leading-none">
              <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-white/70">
                {isIOS ? t("home.field.downloadOnThe", "Download on the") : t("home.field.getItOn", "Get it on")}
              </span>
              <span className="mt-1 text-[17px] font-semibold leading-none">{storeName}</span>
            </span>
          </a>

          {/* Other store — not a browser escape, just the other platform's app */}
          <a
            href={otherUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block text-xs text-muted-foreground/70 underline-offset-2 hover:underline"
          >
            {isIOS ? t("appPrompt.onAndroid", "On Android instead?") : t("appPrompt.onIos", "On iPhone instead?")}
          </a>
        </div>
      </div>
    </div>
  )
}
