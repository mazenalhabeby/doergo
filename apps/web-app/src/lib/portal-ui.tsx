/**
 * Web twin of mobile's portal palette: maps a category's shared semantic colour
 * key to tinted tile classes (full literal strings so Tailwind can JIT them),
 * used for the coloured initials tiles. Reads well in both light and dark themes.
 */

const TILE_CLASSES: Record<string, string> = {
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  purple: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  cyan: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  indigo: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  red: "bg-red-500/15 text-red-600 dark:text-red-400",
  orange: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  slate: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
}

export function portalTile(key?: string | null): string {
  return TILE_CLASSES[key || "slate"] || TILE_CLASSES.slate
}
