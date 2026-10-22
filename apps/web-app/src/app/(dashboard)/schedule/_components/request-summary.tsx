"use client"

import { format } from "date-fns"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { COVER_TONE } from "../_lib/cover-labels"

function Stat({ n, tone, title, sub }: { n: number; tone: keyof typeof COVER_TONE; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-card p-4">
      <span
        className={cn("text-[26px] font-bold leading-none tabular-nums", n ? COVER_TONE[tone].text : "text-foreground")}
      >
        {n}
      </span>
      <span className="text-[12.5px] leading-snug text-muted-foreground">
        <b className="block text-[13px] font-semibold text-foreground">{title}</b>
        {sub}
      </span>
    </div>
  )
}

export type RequestSummaryCounts = { waiting: number; risky: number; skill: number; soonest: string | null }

/** The three numbers over the wallchart: waiting on you, would break cover, would leave a trade uncovered. */
export function RequestSummary({ summary }: { summary: RequestSummaryCounts }) {
  const { t } = useTranslation()
  return (
    <div data-tour="avail-summary" className="mb-4 grid gap-3 sm:grid-cols-3">
      <Stat
        n={summary.waiting}
        tone={summary.waiting ? "tight" : "ok"}
        title={t("cover.summary.waiting", "Waiting on you")}
        sub={
          summary.soonest
            ? t("cover.summary.earliest", "Earliest starts {{date}}", {
                date: format(new Date(summary.soonest), "d MMM"),
              })
            : t("cover.summary.nothing", "Nothing to decide")
        }
      />
      <Stat
        n={summary.risky}
        tone={summary.risky ? "short" : "ok"}
        title={t("cover.summary.risky", "Would break cover")}
        sub={
          summary.risky
            ? t("cover.summary.riskySub", "Approving these drops a day below the floor")
            : t("cover.summary.riskyNone", "None of them thin the floor")
        }
      />
      <Stat
        n={summary.skill}
        tone={summary.skill ? "skill" : "ok"}
        title={t("cover.summary.skill", "Leave a trade uncovered")}
        sub={
          summary.skill
            ? t("cover.summary.skillSub", "The only person with that trade is asking")
            : t("cover.summary.skillNone", "Every trade stays represented")
        }
      />
    </div>
  )
}
