import { type Break, type BreakSummary } from "@/lib/api"
import { BreakStats } from "./break-stats"
import { ActiveBreaks } from "./active-breaks"
import { BreakHistory } from "./break-history"

export interface BreaksTabProps {
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

/** The attendance page's Breaks tab: the day's figures, who is on a break now, the history. */
export function BreaksTab({
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
}: BreaksTabProps) {
  return (
    <div data-tour="breaks-content">
      <BreakStats
        breakSummary={breakSummary}
        loadingBreakSummary={loadingBreakSummary}
        activeCount={activeBreaks.length}
      />

      {/* Active Breaks Section */}
      <ActiveBreaks
        activeBreaks={activeBreaks}
        loadingActiveBreaks={loadingActiveBreaks}
        refetchActiveBreaks={refetchActiveBreaks}
        endBreakManually={endBreakManually}
        canReconcile={canReconcile}
      />

      {/* Break History Section */}
      <BreakHistory
        breakTypeFilter={breakTypeFilter}
        setBreakTypeFilter={setBreakTypeFilter}
        breakDate={breakDate}
        setBreakDate={setBreakDate}
        refetchBreakHistory={refetchBreakHistory}
        loadingBreakHistory={loadingBreakHistory}
        breakHistoryData={breakHistoryData}
      />
    </div>
  )
}
