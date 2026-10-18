import { type Break, type BreakSummary } from "@/lib/api"
import { useTranslation } from "react-i18next"
import { useTimeFormat } from "@/hooks"

export interface BreaksTabProps {
  isAdmin: boolean
  breakSummary?: BreakSummary
  loadingBreakSummary: boolean
  activeBreaks: Break[]
  loadingActiveBreaks: boolean
  refetchActiveBreaks: () => void
  breakHistoryData?: { data?: Break[] }
  loadingBreakHistory: boolean
  refetchBreakHistory: () => void
  breakDate: string
  setBreakDate: (v: string) => void
  breakTypeFilter: string
  setBreakTypeFilter: (v: string) => void
  endBreakManually: { mutate: (args: { breakId: string }) => void; isPending: boolean }
  /** May correct someone else's attendance — `canReconcileAttendance`, not the
   *  admin tier. Ending a member's break for them is that same act. */
  canReconcile: boolean
}

/** BreaksTab's state and handlers — everything before its markup, moved here unchanged. */
export function useBreaksTab({
  isAdmin,
  breakSummary,
  loadingBreakSummary,
  activeBreaks,
  loadingActiveBreaks,
  refetchActiveBreaks,
  breakHistoryData,
  loadingBreakHistory,
  refetchBreakHistory,
  breakDate,
  setBreakDate,
  breakTypeFilter,
  setBreakTypeFilter,
  endBreakManually,
  canReconcile,
}: Pick<BreaksTabProps,
  | 'isAdmin'
  | 'breakSummary'
  | 'loadingBreakSummary'
  | 'activeBreaks'
  | 'loadingActiveBreaks'
  | 'refetchActiveBreaks'
  | 'breakHistoryData'
  | 'loadingBreakHistory'
  | 'refetchBreakHistory'
  | 'breakDate'
  | 'setBreakDate'
  | 'breakTypeFilter'
  | 'setBreakTypeFilter'
  | 'endBreakManually'
  | 'canReconcile'
>) {
  const { t } = useTranslation()
  const { hour12, locale } = useTimeFormat()
  const breakTypeKey = (type: string) => type.toLowerCase()
  // Break times render in the zone WHERE the break was taken — the parent
  // entry's per-entry (GPS) zone first, then the space's zone as fallback.
  const breakTz = (b: Break) =>
    b.timeEntry?.timezone ?? b.location?.timezone ?? b.timeEntry?.location?.timezone

  return { t, hour12, locale, breakTypeKey, breakTz }
}

/** What BreaksTab and its sections read. */
export type BreaksTabState = ReturnType<typeof useBreaksTab>
