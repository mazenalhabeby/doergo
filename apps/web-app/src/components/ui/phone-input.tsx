"use client"

import { useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { getCountries, DIAL_CODES, flagEmoji } from "@/lib/countries"

interface PhoneInputProps {
  /** E.164 value, e.g. "+43664123456". */
  value: string
  onChange: (value: string) => void
  defaultCountry?: string
  placeholder?: string
}

// Dial codes sorted longest-first so prefix matching picks the most specific.
const DIALS_BY_LENGTH = Object.entries(DIAL_CODES)
  .map(([iso, dial]) => ({ iso, dial }))
  .sort((a, b) => b.dial.length - a.dial.length)

// First ISO for each dial code (for display of shared codes like +1).
const ISO_FOR_DIAL = new Map<string, string>()
for (const { iso, dial } of [...DIALS_BY_LENGTH].reverse()) ISO_FOR_DIAL.set(dial, iso)

/** Split an E.164 string into { iso, national } (best-effort). */
function parseE164(value: string): { iso: string; national: string } {
  const digits = (value || "").replace(/[^\d]/g, "")
  if (!digits) return { iso: "", national: "" }
  for (const { dial } of DIALS_BY_LENGTH) {
    if (digits.startsWith(dial)) {
      return { iso: ISO_FOR_DIAL.get(dial) || "", national: digits.slice(dial.length) }
    }
  }
  return { iso: "", national: digits }
}

/**
 * International phone field: searchable country dial-code selector + number.
 * Emits E.164 ("+<dial><number>"). Reuses the shared <Combobox>.
 */
export function PhoneInput({ value, onChange, defaultCountry = "AT", placeholder }: PhoneInputProps) {
  const dialOptions: ComboboxOption[] = useMemo(
    () =>
      getCountries()
        .filter((c) => DIAL_CODES[c.code])
        .map((c) => ({
          value: c.code,
          label: `${flagEmoji(c.code)}  ${c.name} (+${DIAL_CODES[c.code]})`,
          keywords: `${c.name} ${c.code} +${DIAL_CODES[c.code]} ${DIAL_CODES[c.code]}`,
        })),
    [],
  )

  const parsed = useMemo(() => parseE164(value), [])
  const [iso, setIso] = useState(parsed.iso || defaultCountry)
  const [national, setNational] = useState(parsed.national)

  // If the value is set/changed externally after mount (e.g. profile load), resync.
  useEffect(() => {
    const p = parseE164(value)
    if (p.iso) setIso(p.iso)
    setNational(p.national)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const emit = (nextIso: string, nextNational: string) => {
    const dial = DIAL_CODES[nextIso] || ""
    const digits = nextNational.replace(/[^\d]/g, "")
    onChange(digits ? `+${dial}${digits}` : "")
  }

  const triggerLabel = iso ? `${flagEmoji(iso)} +${DIAL_CODES[iso] || ""}` : undefined

  return (
    <div className="flex gap-2">
      <div className="w-[116px] shrink-0">
        <Combobox
          value={iso}
          onChange={(v) => {
            setIso(v)
            emit(v, national)
          }}
          options={dialOptions}
          triggerLabel={triggerLabel}
          placeholder="🌐 +"
          searchPlaceholder="Country or code…"
          contentClassName="w-[300px]"
        />
      </div>
      <Input
        type="tel"
        inputMode="tel"
        value={national}
        onChange={(e) => {
          const v = e.target.value
          setNational(v)
          emit(iso, v)
        }}
        placeholder={placeholder ?? "Phone number"}
        className="h-11 rounded-xl flex-1"
      />
    </div>
  )
}
