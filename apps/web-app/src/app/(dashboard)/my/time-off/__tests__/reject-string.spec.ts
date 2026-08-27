import en from "@/i18n/locales/en.json"
import de from "@/i18n/locales/de.json"
import es from "@/i18n/locales/es.json"
import fr from "@/i18n/locales/fr.json"
// NOT `it` — that shadows Jest's own it().
import italian from "@/i18n/locales/it.json"

/**
 * `timeOff.my.rejectedReason` carries BOTH its own "Rejected:" prefix and a
 * {{reason}} placeholder. It was rendered as
 *
 *     {t("timeOff.my.rejectedReason")}: {r.rejectionReason}
 *
 * — no interpolation value, and the reason appended by hand — which printed the
 * literal "{{reason}}" to the user, followed by a second colon.
 *
 * A string with a placeholder must be given one, so this asserts the shape the
 * caller has to satisfy in every language rather than trusting one reading.
 */
describe("rejection reason string", () => {
  const locales = { en, de, es, fr, it: italian } as Record<string, any>

  it("takes a {{reason}} placeholder in every language", () => {
    for (const [lang, d] of Object.entries(locales)) {
      const s = d?.timeOff?.my?.rejectedReason
      expect(typeof s).toBe("string")
      expect(`${lang}: ${s}`).toContain("{{reason}}")
    }
  })

  it("already includes its own label, so the caller must not add one", () => {
    // If this ever stops being true the render has to change too — the whole
    // bug was a caller assuming the string was a bare label.
    for (const [lang, d] of Object.entries(locales)) {
      const s: string = d.timeOff.my.rejectedReason
      expect(`${lang}: ${s}`).toMatch(/^[a-z]{2}: \S+/)
      expect(s.indexOf("{{reason}}")).toBeGreaterThan(0)
    }
  })
})
