"use client"

import { useTranslation } from "react-i18next"
import { OVERTIME_ROUND_STATES } from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { STATE_PILL } from "../_lib/round-words"

/** What each label means — the page's own key. */
export function StateLegend() {
  const { t } = useTranslation()
  return (
    <section className="rounded-[22px] border border-border bg-card p-4 shadow-shell">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{t("overtimePage.legend.title")}</h2>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-xs">
        {OVERTIME_ROUND_STATES.map((s) => (
          <div key={s} className="contents">
            <dt>
              <span
                className={cn(
                  "inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold",
                  STATE_PILL[s],
                )}
              >
                {t(`overtimePage.state.${s}`)}
              </span>
            </dt>
            <dd className="text-muted-foreground">{t(`overtimePage.legend.${s}`)}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
