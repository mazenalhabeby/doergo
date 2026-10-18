/*
  Six tones for every status colour on the web (docs/design/ui-pieces/variants.md §4).

  A screen keeps only its own `status → tone` map; the colours live here, once.
  `chip` is the tinted pill, `text` colours a value, `solid` fills a bar or dot,
  `well` tints an icon square. Class strings are written out whole so Tailwind
  sees every one.
*/
export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "primary"

export const TONES: Record<Tone, { chip: string; text: string; solid: string; well: string }> = {
  neutral: {
    chip: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
    text: "text-foreground",
    solid: "bg-slate-400",
    well: "bg-muted text-muted-foreground",
  },
  info: {
    chip: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    text: "text-sky-600 dark:text-sky-400",
    solid: "bg-sky-500",
    well: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  success: {
    chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    text: "text-emerald-600 dark:text-emerald-400",
    solid: "bg-emerald-500",
    well: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  warning: {
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    text: "text-amber-600 dark:text-amber-400",
    solid: "bg-amber-500",
    well: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  danger: {
    chip: "bg-red-500/10 text-red-600 dark:text-red-400",
    text: "text-red-600 dark:text-red-400",
    solid: "bg-red-500",
    well: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
  primary: {
    chip: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    text: "text-blue-600 dark:text-blue-400",
    solid: "bg-blue-500",
    well: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
}

export const toneChip = (tone: Tone) => TONES[tone].chip
export const toneText = (tone: Tone) => TONES[tone].text
export const toneSolid = (tone: Tone) => TONES[tone].solid
export const toneWell = (tone: Tone) => TONES[tone].well
