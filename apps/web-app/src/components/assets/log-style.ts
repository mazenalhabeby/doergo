import type { TFunction } from "i18next"
import { COST_LOG_KEY, type KindLogField, type KindLogType, type LogColor } from "@hbcfield/shared/client"

/**
 * How a log type looks and reads on the web — one place.
 *
 * The kind stores a colour NAME (`LOG_COLORS` in shared), never a hex value, so
 * a hand-edited config cannot paint arbitrary colours on every viewer's screen
 * and a re-theme changes this map rather than every saved kind. Classes are
 * spelled out in full because Tailwind only ships classes it can find as text.
 */
export const LOG_COLOR_CLASSES: Record<LogColor, { dot: string; chip: string; bar: string }> = {
  slate: { dot: "bg-slate-500", chip: "bg-slate-500/10 text-slate-700 dark:text-slate-300", bar: "bg-slate-500" },
  blue: { dot: "bg-blue-500", chip: "bg-blue-500/10 text-blue-700 dark:text-blue-300", bar: "bg-blue-500" },
  green: { dot: "bg-emerald-500", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-500" },
  amber: { dot: "bg-amber-500", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300", bar: "bg-amber-500" },
  red: { dot: "bg-red-500", chip: "bg-red-500/10 text-red-700 dark:text-red-300", bar: "bg-red-500" },
  violet: { dot: "bg-violet-500", chip: "bg-violet-500/10 text-violet-700 dark:text-violet-300", bar: "bg-violet-500" },
  teal: { dot: "bg-teal-500", chip: "bg-teal-500/10 text-teal-700 dark:text-teal-300", bar: "bg-teal-500" },
  orange: { dot: "bg-orange-500", chip: "bg-orange-500/10 text-orange-700 dark:text-orange-300", bar: "bg-orange-500" },
}

/** A colour from anything: an unknown name (a removed type's history) reads as slate. */
export const logColor = (name: string | null | undefined) =>
  LOG_COLOR_CLASSES[(name as LogColor) in LOG_COLOR_CLASSES ? (name as LogColor) : "slate"]

/**
 * A type's label as this reader should see it.
 *
 * The built-in Cost log carries an English placeholder label in shared (it is
 * derived, not typed by anybody), so it is translated by its KEY. Every other
 * label is the organization's own word and is shown as they wrote it.
 */
export function logTypeLabel(t: TFunction, type: Pick<KindLogType, "key" | "label"> | null | undefined, fallbackKey?: string | null): string {
  const key = type?.key ?? fallbackKey ?? COST_LOG_KEY
  if (key === COST_LOG_KEY) return t("assetLog.cost", "Cost")
  if (type?.label) return type.label
  // A type the kind has since removed: its key, made readable.
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
}

/** The same for a field: the Cost log's three fields are ours to translate. */
export function logFieldLabel(t: TFunction, type: Pick<KindLogType, "key">, field: KindLogField): string {
  if (type.key !== COST_LOG_KEY) return field.label
  if (field.key === "category") return t("assetLog.costCategory", "Category")
  if (field.key === "amount") return t("assetLog.costAmount", "Amount")
  if (field.key === "receipt") return t("assetLog.costReceipt", "Receipt")
  return field.label
}
