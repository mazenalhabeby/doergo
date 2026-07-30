import type { TFunction } from "i18next"

/**
 * Turn an audit-log eventType into a friendly, localized phrase.
 *
 * Resolution order:
 *  1. A known, hand-authored label under `auditLog.events.<TYPE>` (already
 *     translated in every locale — the org-wide audit page uses these).
 *  2. A localized label under `audit.actions.<TYPE>` (per-entity extras that
 *     aren't in the events map).
 *  3. A generic `${RESOURCE}_${VERB}` decomposition — the VERB is localized via
 *     `audit.verbs.<VERB>` (created/updated/deleted/...) and the RESOURCE is
 *     Title-cased.
 *  4. A humanized Title-case fallback for anything unrecognized.
 */
export function auditActionLabel(eventType: string | null | undefined, t: TFunction): string {
  if (!eventType) return t("audit.actions.unknown", { defaultValue: "Activity" })

  // 1. Known event with a curated translation (shared with the full audit page).
  const known = t(`auditLog.events.${eventType}`, { defaultValue: "" })
  if (known) return known

  // 2. Per-entity extras that live in the audit namespace.
  const extra = t(`audit.actions.${eventType}`, { defaultValue: "" })
  if (extra) return extra

  // 3. Generic `${RESOURCE}_${VERB}` decomposition.
  const parts = eventType.split("_")
  if (parts.length >= 2) {
    const verb = parts[parts.length - 1]!.toLowerCase()
    const resourceWords = parts.slice(0, -1)
    const verbLabel = t(`audit.verbs.${verb}`, { defaultValue: "" })
    if (verbLabel) {
      const resource = resourceWords.map(titleCaseWord).join(" ")
      // e.g. "Report Updated" / "Bericht aktualisiert"
      return t("audit.actions.generic", {
        resource,
        verb: verbLabel,
        defaultValue: `${resource} ${verbLabel}`,
      })
    }
  }

  // 4. Humanized Title-case fallback.
  return eventType.split("_").map(titleCaseWord).join(" ")
}

function titleCaseWord(w: string): string {
  if (!w) return w
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
}
