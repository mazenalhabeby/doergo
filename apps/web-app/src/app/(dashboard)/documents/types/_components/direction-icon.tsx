import { Building2, Upload, ArrowLeftRight } from "lucide-react"
import { cn } from "@/lib/utils"

/** Who files it decides the icon: the office, the member, or either. */
export const DIRECTION_ICON = { ISSUED: Building2, SUPPLIED: Upload, BOTH: ArrowLeftRight } as const
const DIRECTION_TONE = {
  ISSUED: "text-blue-600 dark:text-blue-400",
  SUPPLIED: "text-emerald-600 dark:text-emerald-400",
  BOTH: "text-violet-600 dark:text-violet-400",
} as const
export function DirectionIcon({ direction }: { direction: string }) {
  const d = (direction in DIRECTION_ICON ? direction : "ISSUED") as keyof typeof DIRECTION_ICON
  const Icon = DIRECTION_ICON[d]
  return <Icon className={cn("h-4 w-4 shrink-0", DIRECTION_TONE[d])} />
}
