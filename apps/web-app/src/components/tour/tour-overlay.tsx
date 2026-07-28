"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { ArrowRight, ArrowLeft, MousePointerClick, X } from "lucide-react"

import type { TourStep } from "./types"

const TIP_W = 344
const GAP = 14

/**
 * Presentational overlay for a single active step: a dimming spotlight around
 * the target, a click-blocker so the tour stays guided, an optional click
 * hot-spot (do-it-with-me), and a premium tooltip card. Rendered in a portal.
 */
export function TourOverlay({
  rect,
  step,
  index,
  total,
  onNext,
  onBack,
  onSkip,
  onHoleClick,
}: {
  rect: DOMRect
  step: TourStep
  index: number
  total: number
  onNext: () => void
  onBack: () => void
  onSkip: () => void
  onHoleClick: () => void
}) {
  const { t } = useTranslation()
  const tipRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 })

  const pad = step.padding ?? 8
  const isClick = step.action === "click"

  // Position the tooltip after we can measure its height.
  useLayoutEffect(() => {
    const h = tipRef.current?.offsetHeight ?? 160
    let top = rect.bottom + pad + GAP
    if (top + h > window.innerHeight - 10) top = rect.top - pad - GAP - h // flip above
    if (top < 10) top = 10
    let left = rect.left + rect.width / 2 - TIP_W / 2 // center under target
    left = Math.min(Math.max(10, left), window.innerWidth - TIP_W - 10)
    setTip({ left, top })
  }, [rect, pad, step])

  return createPortal(
    <>
      {/* click-blocker keeps the tour guided (background inert) */}
      <div className="fixed inset-0 z-[70]" aria-hidden />

      {/* spotlight: transparent hole with a huge shadow that dims everything else */}
      <div
        className="pointer-events-none fixed z-[71] rounded-xl ring-2 ring-primary transition-all duration-300 ease-out"
        style={{
          left: rect.left - pad,
          top: rect.top - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
          boxShadow: "0 0 0 9999px rgba(15,23,42,0.55)",
        }}
      />

      {/* click hot-spot over the target (only when the step wants a click) */}
      {isClick && (
        <button
          type="button"
          aria-label={t(step.titleKey)}
          onClick={onHoleClick}
          // Keep clicks from reaching Radix's document listener, so tapping the
          // hot-spot over a field inside a modal doesn't dismiss the dialog.
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="pointer-events-auto fixed z-[72] cursor-pointer rounded-xl"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
        />
      )}

      {/* tooltip card */}
      <div
        ref={tipRef}
        // Stop pointer-downs bubbling to Radix's dismissable-layer listener so the
        // tooltip (rendered outside the dialog) doesn't close an open modal.
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="pointer-events-auto fixed z-[73] w-[344px] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_60px_-12px_rgba(15,23,42,0.45)] animate-in fade-in zoom-in-95 duration-200 ease-out"
        style={{
          left: tip.left,
          top: tip.top,
          // Glide to each next step's position instead of re-popping. The first
          // placement happens in a layout effect (before paint) so it doesn't
          // glide in from the off-screen origin — only step-to-step moves animate.
          transition: "left 320ms cubic-bezier(0.32,0.72,0,1), top 320ms cubic-bezier(0.32,0.72,0,1)",
        }}
      >
        {/* Slim progress bar pinned to the very top edge of the card */}
        <div className="h-1 w-full bg-muted">
          <div
            className="h-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>

        <div className="p-[18px]">
          {/* Header: step counter + close */}
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-primary">
              {t("tours.progress", { current: index + 1, total })}
            </span>
            <button
              type="button"
              onClick={onSkip}
              aria-label={t("tours.skip")}
              className="-mr-1.5 -mt-1.5 grid size-7 place-items-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <h4 className="mb-1.5 text-[16px] font-bold leading-tight tracking-tight text-foreground">{t(step.titleKey)}</h4>
          <p className="text-[13px] leading-relaxed text-muted-foreground">{t(step.bodyKey)}</p>

          {isClick && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-primary">
              <MousePointerClick className="size-3.5 animate-pulse" /> {t("tours.clickHint")}
            </div>
          )}

          {/* Footer: Back (left) · Next/Finish (right) */}
          <div className="mt-5 flex items-center justify-between gap-2">
            {index > 0 ? (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" /> {t("common.back")}
              </button>
            ) : (
              <span aria-hidden />
            )}
            {isClick ? (
              <span className="text-[11.5px] font-medium text-muted-foreground/70">{t("tours.skip")}</span>
            ) : (
              <button
                type="button"
                onClick={onNext}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground shadow-sm shadow-primary/25 transition-colors hover:bg-primary/90"
              >
                {index === total - 1 ? t("tours.finish") : t("tours.next")} <ArrowRight className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
