/**
 * Series palette, in its own module on purpose.
 *
 * It is used by the bar chart AND by the stat cards on the reports page. If it
 * lived in `report-bar-chart.tsx`, importing it for the stat cards would pull
 * recharts straight back into the page bundle and undo the split (audit R-C1).
 */
export const CHART_COLORS = [
  "#6366f1", "#3b82f6", "#0ea5e9", "#14b8a6",
  "#22c55e", "#f59e0b", "#f43f5e", "#a855f7",
]
