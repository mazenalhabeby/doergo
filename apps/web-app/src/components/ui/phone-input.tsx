"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Check } from "lucide-react"
import {
  AsYouType,
  parsePhoneNumberFromString,
  getExampleNumber,
  type CountryCode,
} from "libphonenumber-js"
import examples from "libphonenumber-js/examples.mobile.json"
import { cn } from "@/lib/utils"
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

/** Format a national number for a country, as-you-type (falls back to digits). */
function formatNational(iso: string, digits: string): string {
  if (!digits) return ""
  try {
    return new AsYouType(iso as CountryCode).input(digits)
  } catch {
    return digits
  }
}

/** Best-effort E.164 from a country + national digits. */
function toE164(iso: string, digits: string): string {
  if (!digits) return ""
  try {
    const ayt = new AsYouType(iso as CountryCode)
    ayt.input(digits)
    const e164 = ayt.getNumberValue()
    if (e164) return e164
  } catch {
    /* fall through to the raw dial-code join */
  }
  return `+${DIAL_CODES[iso] || ""}${digits}`
}

/**
 * International phone field: searchable country dial-code selector + a national
 * number that formats itself per the selected country (via libphonenumber-js).
 * Emits E.164 ("+<dial><number>"). Reuses the shared <Combobox>.
 */
export function PhoneInput({ value, onChange, defaultCountry = "AT", placeholder }: PhoneInputProps) {
  const { t } = useTranslation()

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

  // Parse the incoming E.164 once for the initial render.
  const initial = useMemo(() => {
    const pn = value ? parsePhoneNumberFromString(value) : undefined
    if (pn?.country) return { iso: pn.country as string, national: pn.formatNational() }
    return { iso: defaultCountry, national: "" }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [iso, setIso] = useState(initial.iso)
  const [national, setNational] = useState(initial.national)
  // Previous formatted string — lets backspacing a separator still drop a digit.
  const prev = useRef(initial.national)

  const applyNational = (formatted: string) => {
    prev.current = formatted
    setNational(formatted)
  }

  // Resync when the external value changes after mount (e.g. profile load).
  useEffect(() => {
    const pn = value ? parsePhoneNumberFromString(value) : undefined
    if (pn) {
      if (pn.country) setIso(pn.country as string)
      applyNational(pn.formatNational())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const onNationalChange = (raw: string) => {
    let digits = raw.replace(/\D/g, "")
    // If the edit only removed a formatting char (digits unchanged but the string
    // got shorter), drop the last digit so backspace makes real progress.
    if (raw.length < prev.current.length && digits === prev.current.replace(/\D/g, "")) {
      digits = digits.slice(0, -1)
    }
    applyNational(formatNational(iso, digits))
    onChange(toE164(iso, digits))
  }

  const onIsoChange = (v: string) => {
    setIso(v)
    const digits = national.replace(/\D/g, "")
    applyNational(formatNational(v, digits))
    onChange(toE164(v, digits))
  }

  const triggerLabel = iso ? `${flagEmoji(iso)} +${DIAL_CODES[iso] || ""}` : undefined

  // A real example number for the country → shows the expected format as a hint.
  const example = useMemo(() => {
    try {
      return getExampleNumber(iso as CountryCode, examples)?.formatNational()
    } catch {
      return undefined
    }
  }, [iso])

  // Mark the number valid (complete + correct length for the country).
  const isValid = useMemo(() => {
    const digits = national.replace(/\D/g, "")
    if (!digits) return false
    try {
      const ayt = new AsYouType(iso as CountryCode)
      ayt.input(digits)
      return !!ayt.getNumber()?.isValid()
    } catch {
      return false
    }
  }, [iso, national])

  return (
    <div className="flex gap-2">
      <div className="w-[116px] shrink-0">
        <Combobox
          value={iso}
          onChange={onIsoChange}
          options={dialOptions}
          maxResults={dialOptions.length}
          triggerLabel={triggerLabel}
          placeholder="🌐 +"
          searchPlaceholder={t("common.countryOrCode")}
          contentClassName="w-[320px]"
        />
      </div>
      <div className="relative flex-1">
        <Input
          type="tel"
          inputMode="tel"
          value={national}
          onChange={(e) => onNationalChange(e.target.value)}
          placeholder={placeholder ?? example ?? t("common.phoneNumber")}
          className={cn("h-11 rounded-xl w-full", isValid && "pr-9")}
        />
        {isValid && (
          <Check className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-600" />
        )}
      </div>
    </div>
  )
}
