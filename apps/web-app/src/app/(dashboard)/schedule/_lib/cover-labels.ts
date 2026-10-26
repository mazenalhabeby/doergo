import type { TFunction } from "i18next"
import type { CoverVerdict, FloorSpace } from "@/lib/api"

/**
 * Turning a cover verdict into words, once.
 *
 * The server sends PARTS — a level, a count, a floor, a trade — and never a
 * sentence, so the phrasing can be translated and so the chart badge, the drawer
 * heading and the summary strip cannot describe the same verdict three
 * different ways. Everything visual about a level is decided here too, for the
 * same reason.
 */

type CoverLevel = CoverVerdict["level"]

/** Palette per level, from the design tokens. Semantic colour only — the leave
 *  bars themselves are told apart by TEXTURE, so hue is free to mean severity. */
export const COVER_TONE: Record<CoverLevel, { text: string; bg: string; ring: string; dot: string }> = {
  ok: {
    text: "text-shell-accent",
    bg: "bg-shell-accent-soft",
    ring: "ring-[color-mix(in_srgb,var(--shell-accent)_30%,transparent)]",
    dot: "bg-shell-accent",
  },
  tight: {
    text: "text-shell-warn",
    bg: "bg-[color-mix(in_srgb,var(--shell-warn)_13%,transparent)]",
    ring: "ring-[color-mix(in_srgb,var(--shell-warn)_30%,transparent)]",
    dot: "bg-shell-warn",
  },
  short: {
    text: "text-shell-crit",
    bg: "bg-[color-mix(in_srgb,var(--shell-crit)_11%,transparent)]",
    ring: "ring-[color-mix(in_srgb,var(--shell-crit)_30%,transparent)]",
    dot: "bg-shell-crit",
  },
  skill: {
    text: "text-shell-crit",
    bg: "bg-[color-mix(in_srgb,var(--shell-crit)_11%,transparent)]",
    ring: "ring-[color-mix(in_srgb,var(--shell-crit)_30%,transparent)]",
    dot: "bg-shell-crit",
  },
}

/** A single character for the bar itself — the chart must read without hover. */
export function coverMark(level: CoverLevel): string {
  return level === "ok" ? "" : level === "tight" ? "!" : "▲"
}

/** The short headline. */
export function coverTitle(v: CoverVerdict, t: TFunction): string {
  switch (v.level) {
    case "skill":
      return t("cover.title.skill", "No {{skill}} cover", { skill: v.skill ?? "" })
    case "short":
      return t("cover.title.short", "Below minimum cover on {{count}} day", { count: v.breachDays })
    case "tight":
      return t("cover.title.tight", "Exactly at minimum")
    default:
      return t("cover.title.ok", "Cover holds")
  }
}

/** The sentence under it — always says what the number would become. */
export function coverDetail(v: CoverVerdict, t: TFunction): string {
  if (v.level === "skill") {
    return t("cover.detail.skill", {
      defaultValue:
        "They are the only {{skill}} person rostered here on {{count}} of these days. Headcount alone would have called this fine.",
      skill: v.skill ?? "",
      count: v.skillGapDays,
    })
  }
  if (v.level === "short") {
    return t("cover.detail.short", {
      defaultValue: "Approving this takes the thinnest day to {{worst}}, and this workspace needs {{floor}}.",
      worst: v.worst,
      floor: v.floor,
    })
  }
  if (v.level === "tight") {
    return t("cover.detail.tight", {
      defaultValue: "{{worst}} left, which is the minimum. No slack — one sick day and the workspace is short.",
      worst: v.worst,
    })
  }
  if (!v.floor) {
    return t("cover.detail.noFloor", {
      defaultValue:
        "{{worst}} would be left. No minimum is set for this workspace, so there is nothing to judge it against.",
      worst: v.worst,
    })
  }
  return t("cover.detail.ok", {
    defaultValue: "{{worst}} on the floor at the thinnest, against a minimum of {{floor}}.",
    worst: v.worst,
    floor: v.floor,
  })
}

/** The one-line form for a chart bar's tooltip and the compact list. */
export function coverShort(v: CoverVerdict, t: TFunction): string {
  if (v.level === "skill") return t("cover.short.skill", "No {{skill}} cover", { skill: v.skill ?? "" })
  if (v.level === "short")
    return t("cover.short.short", "{{worst}} left, needs {{floor}}", { worst: v.worst, floor: v.floor })
  if (v.level === "tight") return t("cover.short.tight", "At minimum ({{worst}})", { worst: v.worst })
  return t("cover.short.ok", "{{worst}} left", { worst: v.worst })
}

/** The live floor panel's pill. `here` is the clock; the floor is the rule. */
export function floorLabel(space: Pick<FloorSpace, "here" | "minCover" | "status">, t: TFunction): string {
  if (!space.minCover) return t("cover.floor.none", "No minimum set")
  if (space.status === "short") return t("cover.floor.short", "{{n}} under minimum", { n: space.minCover - space.here })
  if (space.status === "tight") return t("cover.floor.tight", "At minimum {{floor}}", { floor: space.minCover })
  return t("cover.floor.ok", "Minimum {{floor}}", { floor: space.minCover })
}

export const FLOOR_TONE: Record<FloorSpace["status"], string> = {
  ok: "bg-shell-accent-soft text-shell-accent",
  tight: "bg-[color-mix(in_srgb,var(--shell-warn)_13%,transparent)] text-shell-warn",
  short: "bg-[color-mix(in_srgb,var(--shell-crit)_11%,transparent)] text-shell-crit",
}
