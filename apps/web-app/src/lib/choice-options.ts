import { KIND_SHAPE_LIMITS } from "@hbcfield/shared/client"

/**
 * Editing the options of a choice field — Diesel, Petrol, Electric — as a list.
 *
 * Pure so the rules are pinned by a spec, and the SAME rules the shared
 * normaliser applies on save (`normalizeLogTypes`): trimmed, at most
 * `maxOptionLabel` characters, at most `maxChoiceOptions`, and one spelling per
 * option however it is capitalised. They are applied here as well because an
 * option that is typed, shown, and then silently dropped on save reads as the
 * form losing work — the reason the editor enforces every other rule it can.
 *
 * The stored shape does not change: a `string[]` on the field.
 */

export const CHOICE_LIMITS = {
  max: KIND_SHAPE_LIMITS.maxChoiceOptions,
  maxLabel: KIND_SHAPE_LIMITS.maxOptionLabel,
} as const

const norm = (s: string) => s.trim().toLowerCase()

export type AddRefusal = "empty" | "duplicate" | "full"

/**
 * Add what was typed. A pasted "Diesel, Petrol; Electric" (or one per line) adds
 * each — the way these lists were entered before, kept for whoever has one in a
 * spreadsheet.
 *
 * Returns the new list and, when nothing at all was added, why: said beside the
 * box instead of the button doing nothing.
 */
export function addOptions(list: readonly string[], raw: string): { list: string[]; refused: AddRefusal | null } {
  const parts = raw.split(/[,;\n]/).map((p) => p.trim().slice(0, CHOICE_LIMITS.maxLabel)).filter(Boolean)
  if (parts.length === 0) return { list: [...list], refused: "empty" }
  const seen = new Set(list.map(norm).filter(Boolean))
  const next = [...list]
  let sawDuplicate = false
  let sawFull = false
  for (const p of parts) {
    if (seen.has(norm(p))) { sawDuplicate = true; continue }
    if (next.length >= CHOICE_LIMITS.max) { sawFull = true; break }
    seen.add(norm(p))
    next.push(p)
  }
  const added = next.length > list.length
  return { list: next, refused: added ? null : sawFull ? "full" : sawDuplicate ? "duplicate" : "empty" }
}

/**
 * Rename in place. Not trimmed while typing — "Heating oil" needs its space
 * before the second word exists — only capped; `tidyOption` trims when the box
 * is left. A rename that collides is ALLOWED and flagged (`duplicateIndexes`):
 * refusing a keystroke leaves nobody able to type "Diesel" over "diesel".
 */
export function renameOption(list: readonly string[], index: number, raw: string): string[] {
  if (index < 0 || index >= list.length) return [...list]
  return list.map((o, i) => (i === index ? raw.trimStart().slice(0, CHOICE_LIMITS.maxLabel) : o))
}

/**
 * When a box is left: trim it.
 *
 * A row left blank is NOT removed here. Blur fires before the click that caused
 * it, so removing a row on blur shifts every row under the pointer and the
 * "move up" somebody pressed lands on the neighbour. A blank row is dropped by
 * the normaliser on save, and the ✕ beside it is one click.
 */
export function tidyOption(list: readonly string[], index: number): string[] {
  if (index < 0 || index >= list.length) return [...list]
  return list.map((o, i) => (i === index ? o.trim() : o))
}

export function removeOption(list: readonly string[], index: number): string[] {
  return list.filter((_, i) => i !== index)
}

/** Swap with a neighbour. Order is what the phone shows as chips, so it is the owner's to set. */
export function moveOption(list: readonly string[], index: number, by: -1 | 1): string[] {
  const j = index + by
  if (index < 0 || index >= list.length || j < 0 || j >= list.length) return [...list]
  const next = [...list]
  ;[next[index], next[j]] = [next[j]!, next[index]!]
  return next
}

/**
 * Which rows repeat an EARLIER one, case-insensitively — the ones the normaliser
 * will drop on save, since it keeps the first spelling it meets.
 */
export function duplicateIndexes(list: readonly string[]): Set<number> {
  const seen = new Set<string>()
  const out = new Set<number>()
  list.forEach((o, i) => {
    const k = norm(o)
    if (!k) return
    if (seen.has(k)) out.add(i)
    else seen.add(k)
  })
  return out
}
