"use client"

import { useTranslation } from "react-i18next"
import { AnimatedLogo } from "@hbcfield/shared/components"
import { cn } from "@/lib/utils"

/**
 * The wizard chrome: a single centered card panel with a slim brand progress
 * bar, a branded header (logo + step pill) and an optional back/skip footer.
 * Presentational — the orchestrator owns state and passes progress in.
 */
export function WizardShell({
  step,
  total,
  showChrome,
  canBack,
  onBack,
  onSkip,
  children,
}: {
  /** 1-based step number; drives the progress bar + pill. */
  step: number
  total: number
  /** Show the step pill + footer (hidden on splash / build / done). */
  showChrome: boolean
  canBack: boolean
  onBack: () => void
  onSkip: () => void
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const pct = step >= 1 ? (Math.min(step, total) / total) * 100 : 0

  return (
    <div className="force-light fixed inset-0 z-10 flex items-center justify-center overflow-y-auto bg-slate-50 bg-[radial-gradient(900px_500px_at_12%_-8%,#eef4ff_0,transparent_60%),radial-gradient(800px_460px_at_108%_0%,#f0fdf6_0,transparent_55%)] p-5 text-slate-900">
      <div className="my-auto w-full max-w-[680px] overflow-hidden rounded-3xl border border-border bg-card shadow-[0_1px_2px_rgba(16,24,40,.04),0_24px_60px_-18px_rgba(16,24,40,.18)]">
        {/* progress */}
        <div className="h-1 bg-slate-100">
          <div
            className="h-full rounded-r-full bg-gradient-to-r from-primary to-blue-500 transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-3.5">
          <AnimatedLogo size="small" />
          <span
            className={cn(
              "rounded-full border border-border bg-slate-50 px-3 py-[5px] text-[12.5px] font-semibold text-muted-foreground",
              !showChrome && "invisible",
            )}
          >
            {t("setup.stepOf", { step, total })}
          </span>
        </div>
        {/* body */}
        <div className="flex min-h-[430px] flex-col justify-center px-10 py-9">{children}</div>
        {/* footer */}
        {showChrome && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-[#fcfdfe] px-6 py-3">
            <button
              type="button"
              onClick={onBack}
              disabled={!canBack}
              className="rounded-lg px-2 py-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground disabled:pointer-events-none disabled:opacity-0"
            >
              ← {t("common.back")}
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="rounded-lg px-2 py-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground"
            >
              {t("setup.skip")}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
