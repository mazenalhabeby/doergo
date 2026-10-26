import React from "react"
import { SEG, segButton } from "@/components/attendance/time-styles"
import { useTranslation } from "react-i18next"
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subMonths } from "date-fns"
import { cn } from "@/lib/utils"
import { type CompanyLocation } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MapPin, RefreshCw, Search, ArrowRight } from "lucide-react"
import { DatePicker } from "@/components/ui/date-picker"
import type { TrackingTabProps } from "./tracking-types"

/** A date inside the From → To pill: the pill is the field, so the trigger draws no box of its own. */
const PILL_TRIGGER = "h-9 w-[132px] border-0 bg-transparent px-1 shadow-none hover:bg-transparent"

type FilterProps = Pick<
  TrackingTabProps,
  | "searchQuery"
  | "setSearchQuery"
  | "selectedLocationId"
  | "setSelectedLocationId"
  | "selectedStatus"
  | "setSelectedStatus"
  | "selectedDate"
  | "setSelectedDate"
  | "endDate"
  | "setEndDate"
  | "setPage"
  | "locations"
  | "refetch"
>

/** Search, workspace, status, the date range and its quick presets. Every change goes back to page 1. */
export function TrackingFilters({
  searchQuery,
  setSearchQuery,
  selectedLocationId,
  setSelectedLocationId,
  selectedStatus,
  setSelectedStatus,
  selectedDate,
  setSelectedDate,
  endDate,
  setEndDate,
  setPage,
  locations,
  refetch,
}: FilterProps) {
  const { t } = useTranslation()

  // Quick date-range presets (computed once on mount).
  const presets = React.useMemo(() => {
    const now = new Date()
    const f = (d: Date) => format(d, "yyyy-MM-dd")
    return [
      { key: "today", from: f(now), to: f(now) },
      { key: "last7", from: f(subDays(now, 6)), to: f(now) },
      { key: "thisWeek", from: f(startOfWeek(now, { weekStartsOn: 1 })), to: f(endOfWeek(now, { weekStartsOn: 1 })) },
      { key: "thisMonth", from: f(startOfMonth(now)), to: f(endOfMonth(now)) },
      // The whole previous calendar month — the range payroll is checked against.
      { key: "lastMonth", from: f(startOfMonth(subMonths(now, 1))), to: f(endOfMonth(subMonths(now, 1))) },
    ]
  }, [])

  const applyRange = (from: string, to: string) => {
    setSelectedDate(from)
    setEndDate(to)
    setPage(1)
  }

  return (
    <div data-tour="tracking-filters" className="flex flex-wrap items-center gap-3 mb-6">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("attendance.tracking.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-11 bg-card border-border rounded-full"
        />
      </div>

      {/* Location Filter */}
      <Select
        value={selectedLocationId}
        onValueChange={(value) => {
          setSelectedLocationId(value)
          setPage(1)
        }}
      >
        <SelectTrigger className="w-[200px] h-11 rounded-full bg-card border-border">
          <MapPin className="size-4 mr-2 text-muted-foreground" />
          <SelectValue placeholder={t("attendance.tracking.selectLocation")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("attendance.tracking.allLocations")}</SelectItem>
          {locations.map((location: CompanyLocation) => (
            <SelectItem key={location.id} value={location.id}>
              {location.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Status Filter */}
      <Select
        value={selectedStatus}
        onValueChange={(value) => {
          setSelectedStatus(value)
          setPage(1)
        }}
      >
        <SelectTrigger className="w-[150px] h-11 rounded-full bg-card border-border">
          <SelectValue placeholder={t("attendance.tracking.statusPlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("common.allStatuses")}</SelectItem>
          <SelectItem value="CLOCKED_IN">{t("attendance.status.active")}</SelectItem>
          <SelectItem value="CLOCKED_OUT">{t("attendance.status.completed")}</SelectItem>
          <SelectItem value="AUTO_OUT">{t("attendance.tracking.autoClockOut")}</SelectItem>
        </SelectContent>
      </Select>

      {/* Date range — unified From → To pill */}
      <div
        className={
          "group inline-flex items-center h-11 gap-1 rounded-xl border " +
          "border-border bg-card px-3 transition-colors " +
          "focus-within:border-foreground/30 focus-within:ring-2 " +
          "focus-within:ring-foreground/10"
        }
      >
        <DatePicker
          aria-label={t("attendance.tracking.fromDate")}
          title={t("attendance.tracking.fromDate")}
          value={selectedDate}
          max={endDate}
          onChange={(v) => {
            setSelectedDate(v)
            setPage(1)
          }}
          triggerClassName={PILL_TRIGGER}
        />
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/50" />
        <DatePicker
          aria-label={t("attendance.tracking.toDate")}
          title={t("attendance.tracking.toDate")}
          value={endDate}
          min={selectedDate}
          onChange={(v) => {
            setEndDate(v)
            setPage(1)
          }}
          triggerClassName={PILL_TRIGGER}
        />
      </div>

      {/* Refresh Button */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => refetch()}
        className="h-11 w-11 rounded-full border-border bg-card hover:bg-accent"
      >
        <RefreshCw className="size-4 text-muted-foreground" />
      </Button>

      {/* Quick range presets */}
      <div className={SEG}>
        {presets.map((p) => {
          const active = selectedDate === p.from && endDate === p.to
          return (
            <button key={p.key} type="button" onClick={() => applyRange(p.from, p.to)} className={segButton(active)}>
              {t(`attendance.tracking.presets.${p.key}`)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
