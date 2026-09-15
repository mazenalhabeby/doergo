import { parseClientLocale, SUPPORTED_LOCALES } from "@hbcfield/shared/client"
import {
  CLIENT_LOCALE_OPTIONS,
  clientLocaleFormValue,
  clientLocaleName,
  clientLocalePayload,
} from "../client-locale"

/*
  The client form's "Language for emails", read and written.

  What matters is the round trip: a record opens with its language selected,
  saves it back unchanged, and "same as the organization" goes out as null — not
  as "", and not as a guess. And the select may only offer what the server
  accepts, or the office picks a language and the save is refused.
*/
describe("client record language — the form", () => {
  it("offers exactly the languages the server accepts, each named in itself", () => {
    expect(CLIENT_LOCALE_OPTIONS.map((o) => o.value)).toEqual([...SUPPORTED_LOCALES])
    for (const o of CLIENT_LOCALE_OPTIONS) expect(parseClientLocale(o.value)).toEqual({ ok: true, locale: o.value })
    expect(CLIENT_LOCALE_OPTIONS.find((o) => o.value === "de")?.label).toBe("Deutsch")
    expect(CLIENT_LOCALE_OPTIONS.find((o) => o.value === "fr")?.label).toBe("Français")
  })

  it("round-trips a chosen language", () => {
    const opened = clientLocaleFormValue({ locale: "it" })
    expect(opened).toBe("it")
    expect(clientLocalePayload(opened)).toBe("it")
  })

  it("round-trips 'same as the organization' as null", () => {
    for (const record of [{ locale: null }, {}, undefined]) {
      const opened = clientLocaleFormValue(record)
      expect(opened).toBe("")
      expect(clientLocalePayload(opened)).toBeNull()
    }
  })

  it("opens a stored value that is not on the list as not set, rather than as an option that does not exist", () => {
    expect(clientLocaleFormValue({ locale: "pt" })).toBe("")
  })

  it("names the language on the record details, or nothing when unset", () => {
    expect(clientLocaleName("es")).toBe("Español")
    expect(clientLocaleName(null)).toBeNull()
  })
})
