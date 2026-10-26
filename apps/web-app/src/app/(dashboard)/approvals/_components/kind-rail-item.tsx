import { Count, RAIL_ROW } from "@/components/page/page-kit"

/** One kind in the inbox's rail, with its count (coral when something cannot wait). */
export function KindRailItem({
  active,
  label,
  count,
  urgent,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  urgent?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? "true" : undefined} className={RAIL_ROW}>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count > 0 && <Count n={count} tone={urgent ? "crit" : "warn"} />}
    </button>
  )
}
