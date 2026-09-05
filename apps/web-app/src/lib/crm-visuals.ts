import { CUSTOMER_STAGES } from "@hbcfield/shared/client"

/**
 * How a client looks — in one place, because two screens show the same client.
 *
 * The record page had a gradient avatar keyed to the name and a coloured dot per
 * lifecycle stage; the list had a grey square and the stage's name buried in a
 * dot-joined string. Same client, two vocabularies, and the list read as the
 * plain index of a product whose detail page was designed.
 *
 * These are the record page's own helpers, lifted so both use them. Nothing here
 * is new — it is the vocabulary the product already had, spoken everywhere.
 */

/** Two letters from a name — the fallback when there is no logo to show. */
export const initials = (n: string) =>
  n.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()

/**
 * The avatar, in neutral.
 *
 * It was one of six gradients keyed to the name. Six saturated squares stacked
 * down a page is a lot of colour for information a reader gets from the name
 * anyway — and colour that means nothing competes with the two places in this
 * product where colour DOES mean something: the lifecycle stage, and app access.
 *
 * Identity comes from the shape instead. A company is a rounded square, a person
 * is a circle, and that is the only distinction the list is being asked to draw.
 */
export const AVATAR_TONE = "bg-muted text-muted-foreground ring-1 ring-inset ring-border"

/** Tailwind tokens, not hex — so both themes stay right. */
const STAGE_DOT: Record<string, string> = {
  slate: "bg-slate-400",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  green: "bg-emerald-500",
  gray: "bg-gray-400",
}

export function stageDot(key: string) {
  return STAGE_DOT[CUSTOMER_STAGES.find((s) => s.key === key)?.tone ?? "slate"] ?? "bg-slate-400"
}

/**
 * A company is a rounded square, a person is a circle.
 *
 * The one piece of shape language in the CRM, and it does real work: it answers
 * "is this a firm or a human?" before a word has been read, which is the whole
 * distinction the list is being asked to make clear.
 */
export const shapeFor = (type?: string | null) => (type === "COMPANY" ? "rounded-xl" : "rounded-full")

/** "2h ago" / "12 Mar" — short enough to sit at the end of a row. */
export function relTime(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
