import { cn } from "@/lib/utils"
import { type Break } from "@/lib/api"
import { UserAvatar } from "@/components/common/user-avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Coffee, UtensilsCrossed, Pause, RefreshCw, Calendar, UserPen } from "lucide-react"
import { formatTime, NoteCell } from "./attendance-helpers"
import { formatDuration, personName, countryFromTz, isLabelCode, labelWord } from "@hbcfield/shared/client"
import { useTranslation } from "react-i18next"
import { useTimeFormat } from "@/hooks"
import { breakTypeKey, breakTz } from "./break-format"
import type { BreaksTabProps } from "./breaks-tab"

/** The Breaks tab's history: the day's breaks, filtered by type, with who entered them. */
export function BreakHistory({
  breakTypeFilter,
  setBreakTypeFilter,
  breakDate,
  setBreakDate,
  refetchBreakHistory,
  loadingBreakHistory,
  breakHistoryData,
}: Pick<
  BreaksTabProps,
  | "breakTypeFilter"
  | "setBreakTypeFilter"
  | "breakDate"
  | "setBreakDate"
  | "refetchBreakHistory"
  | "loadingBreakHistory"
  | "breakHistoryData"
>) {
  const { t } = useTranslation()
  const { hour12, locale } = useTimeFormat()
  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm">
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t("attendance.breaks.breakHistory")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("attendance.breaks.viewPastRecords")}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Break Type Filter */}
            <Select value={breakTypeFilter} onValueChange={setBreakTypeFilter}>
              <SelectTrigger className="w-[130px] h-10 rounded-lg bg-card border-border/80 shadow-sm">
                <SelectValue placeholder={t("attendance.breaks.typeFilter")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.allTypes")}</SelectItem>
                <SelectItem value="LUNCH">{t("attendance.breaks.types.lunch")}</SelectItem>
                <SelectItem value="SHORT">{t("attendance.breaks.types.short")}</SelectItem>
                <SelectItem value="OTHER">{t("attendance.breaks.types.other")}</SelectItem>
              </SelectContent>
            </Select>

            {/* Date Filter */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                type="date"
                value={breakDate}
                onChange={(e) => setBreakDate(e.target.value)}
                className="pl-9 w-[160px] h-10 bg-card/80 border-border/80 rounded-lg shadow-sm"
              />
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={() => refetchBreakHistory()}
              className="h-10 w-10 rounded-lg border-border/80 bg-card shadow-sm hover:bg-accent"
            >
              <RefreshCw className="size-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </div>

      {loadingBreakHistory ? (
        <div className="p-6 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !breakHistoryData?.data?.length ? (
        <div className="p-12 text-center">
          <Coffee className="size-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground">{t("attendance.breaks.noRecords")}</h3>
          <p className="text-muted-foreground mt-1">{t("attendance.breaks.noRecordsHint")}</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/80">
              <TableHead className="font-semibold text-muted-foreground">{t("attendance.worker")}</TableHead>
              <TableHead className="font-semibold text-muted-foreground">{t("attendance.type")}</TableHead>
              <TableHead className="font-semibold text-muted-foreground">{t("attendance.started")}</TableHead>
              <TableHead className="font-semibold text-muted-foreground">{t("attendance.ended")}</TableHead>
              <TableHead className="font-semibold text-muted-foreground">{t("common.duration")}</TableHead>
              <TableHead className="font-semibold text-muted-foreground">{t("attendance.notes")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {breakHistoryData.data.map((breakItem: Break) => (
              <TableRow key={breakItem.id} className="hover:bg-accent/50">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      firstName={breakItem.user?.firstName}
                      lastName={breakItem.user?.lastName}

                      seed={breakItem.user?.id}
                      size="md"
                    />
                    <span className="font-medium text-foreground">{personName(breakItem.user)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border",
                      breakItem.type === "LUNCH"
                        ? "bg-amber-500/10 text-amber-700 border-amber-200"
                        : breakItem.type === "SHORT"
                          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200"
                          : "bg-muted text-foreground border-border",
                    )}
                  >
                    {breakItem.type === "LUNCH" ? (
                      <UtensilsCrossed className="size-3.5" />
                    ) : breakItem.type === "SHORT" ? (
                      <Coffee className="size-3.5" />
                    ) : (
                      <Pause className="size-3.5" />
                    )}
                    {t(`attendance.breaks.types.${breakTypeKey(breakItem.type)}`)}
                  </span>
                </TableCell>
                <TableCell className="text-foreground">
                  <div>{formatTime(breakItem.startedAt, hour12, locale, breakTz(breakItem))}</div>
                  {countryFromTz(breakTz(breakItem), locale) && (
                    <div className="text-xs text-muted-foreground">{countryFromTz(breakTz(breakItem), locale)}</div>
                  )}
                </TableCell>
                <TableCell className="text-foreground">
                  {breakItem.endedAt ? (
                    formatTime(breakItem.endedAt, hour12, locale, breakTz(breakItem))
                  ) : (
                    <span className="text-orange-600">{t("attendance.breaks.onBreak")}</span>
                  )}
                </TableCell>
                <TableCell className="font-medium text-foreground">
                  {formatDuration(breakItem.durationMinutes)}
                  {/*
                    Who entered it, when it was not the member.

                    The row is otherwise identical to one the member
                    recorded on their phone, and the difference matters:
                    this one changed their paid hours and somebody else
                    decided it. Storing that and not showing it would
                    leave an audit trail nobody can read.
                  */}
                  {breakItem.addedBy && (
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] font-normal text-amber-600 dark:text-amber-400">
                      <UserPen className="size-3" />
                      <span title={breakItem.reason || undefined}>
                        {t("attendance.breaks.addedBy", "Added by {{name}}", {
                          name: personName(breakItem.addedBy),
                        })}
                      </span>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {/* A rest the automatic clock inserted carries its label code as the reason — show its words. */}
                  <NoteCell
                    note={
                      isLabelCode(breakItem.reason)
                        ? labelWord(breakItem.reason, locale)
                        : breakItem.reason || breakItem.notes
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
