import { cn } from "@/lib/utils"
import { type Break } from "@/lib/api"
import { useTranslation } from "react-i18next"
import { useTimeFormat } from "@/hooks"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Coffee, Clock, UtensilsCrossed, Pause, RefreshCw, CheckCircle2 } from "lucide-react"
import { personName } from "@hbcfield/shared/client"
import { formatTime } from "../../../../components/attendance/attendance-helpers"
import { breakTypeKey, breakTz } from "./break-format"
import type { BreaksTabProps } from "./breaks-tab"
import { useState } from "react"
import { ConfirmDialog } from "@/components/common/confirm-dialog"

/** Who is on a break right now — and, for whoever may correct attendance, ending one for them. */
export function ActiveBreaks({
  activeBreaks,
  loadingActiveBreaks,
  refetchActiveBreaks,
  endBreakManually,
  canReconcile,
}: Pick<
  BreaksTabProps,
  "activeBreaks" | "loadingActiveBreaks" | "refetchActiveBreaks" | "endBreakManually" | "canReconcile"
>) {
  const { t } = useTranslation()
  const { hour12, locale } = useTimeFormat()
  // The break somebody asked to end, waiting for the confirm.
  const [endingId, setEndingId] = useState<string | null>(null)
  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm mb-6">
      <ConfirmDialog
        open={endingId !== null}
        onOpenChange={(open) => !open && setEndingId(null)}
        title={t("attendance.breaks.endBreakConfirm")}
        description={t("common.cannotBeUndone")}
        confirmLabel={t("attendance.breaks.endBreak")}
        onConfirm={() => endingId && endBreakManually.mutate({ breakId: endingId })}
      />
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-orange-50 dark:bg-orange-500/10 text-orange-600">
              <Coffee className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t("attendance.breaks.activeBreaks")}</h2>
              <p className="text-sm text-muted-foreground">{t("attendance.breaks.workersOnBreak")}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetchActiveBreaks()} className="rounded-lg">
            <RefreshCw className="size-4 mr-2" />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      {loadingActiveBreaks ? (
        <div className="p-6 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : activeBreaks.length === 0 ? (
        <div className="p-12 text-center">
          <CheckCircle2 className="size-12 text-green-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground">{t("attendance.breaks.noActiveBreaks")}</h3>
          <p className="text-muted-foreground mt-1">{t("attendance.breaks.allWorking")}</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {activeBreaks.map((breakItem: Break) => (
            <div key={breakItem.id} className="p-4 flex items-center justify-between hover:bg-accent">
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "size-10 rounded-full flex items-center justify-center",
                    breakItem.type === "LUNCH"
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      : breakItem.type === "SHORT"
                        ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {breakItem.type === "LUNCH" ? (
                    <UtensilsCrossed className="size-5" />
                  ) : breakItem.type === "SHORT" ? (
                    <Coffee className="size-5" />
                  ) : (
                    <Pause className="size-5" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-foreground">{personName(breakItem.user)}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{t(`attendance.breaks.typeBreak.${breakTypeKey(breakItem.type)}`)}</span>
                    <span>•</span>
                    <span>
                      {t("attendance.breaks.startedAt", {
                        time: formatTime(breakItem.startedAt, hour12, locale, breakTz(breakItem)),
                      })}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full",
                    "bg-orange-50 dark:bg-orange-500/10 text-orange-700 border border-orange-200",
                  )}
                >
                  <Clock className="size-3.5" />
                  {t("attendance.breaks.onBreak")}
                </span>
                {canReconcile && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEndingId(breakItem.id)}
                    disabled={endBreakManually.isPending}
                    className="rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  >
                    {t("attendance.breaks.endBreak")}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
