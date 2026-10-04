"use client"

import { useEffect, useRef, useState } from "react"
import { parseExchangeRate, toOrganizationCurrency } from "@hbcfield/shared"

import { invoicesApi } from "@/lib/api"

/**
 * The exchange rate of an invoice in another currency than the organization's.
 *
 * Filled from the ECB for the issue date, and re-filled when the currency or the
 * date changes — until somebody types their own, which then stays put. Saved
 * with the invoice; a margin reads it, never a live rate.
 *
 * ⚠️ No rate is no margin. `rate` is null while nothing is known, and the screen
 * shows "—" rather than a figure converted at a guess.
 */
export function useExchangeRate(opts: {
  currency: string
  baseCurrency: string
  issueDate: string
  /**
   * An existing invoice: what it was saved with, kept until the currency or the
   * day changes. Pass `ready` only once the screen has loaded it into its own
   * state, so the loading render does not look like a change.
   */
  seed?: { rate: number | null; source: "ECB" | "MANUAL" | null; date: string | null }
  ready?: boolean
}) {
  const { currency, baseCurrency, issueDate, seed, ready = true } = opts
  const differs = !!currency && !!baseCurrency && currency !== baseCurrency
  const [text, setText] = useState("")
  const [source, setSource] = useState<"ECB" | "MANUAL" | null>(null)
  const [date, setDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  /** The currency and day the current rate belongs to — a fetch only when they change. */
  const settled = useRef<string | null>(null)

  /** Only the latest request may answer — a slow reply for USD must not land after EUR was chosen. */
  const latest = useRef(0)
  const fetchEcb = () => {
    const id = ++latest.current
    const alive = () => latest.current === id
    setLoading(true)
    invoicesApi
      .exchangeRate(currency, issueDate || undefined)
      .then((r) => {
        if (!alive()) return
        if (r?.rate != null) {
          setText(String(r.rate)); setSource("ECB"); setDate(r.date)
        } else {
          setText(""); setSource(null); setDate(null)
        }
      })
      .catch(() => {
        if (alive()) { setText(""); setSource(null); setDate(null) }
      })
      .finally(() => alive() && setLoading(false))
  }

  useEffect(() => {
    if (!ready) return
    const key = `${currency}|${baseCurrency}|${issueDate}`
    if (settled.current === null && seed) {
      // An existing invoice opens with what it was saved with.
      settled.current = key
      setText(seed.rate != null ? String(seed.rate) : "")
      setSource(seed.rate != null ? seed.source : null)
      setDate(seed.date)
      return
    }
    if (settled.current === key) return
    settled.current = key
    if (!differs) {
      latest.current++
      setText(""); setSource(null); setDate(null); setLoading(false)
      return
    }
    if (source === "MANUAL") return
    fetchEcb()
    // `source` deliberately not a dependency: typing a rate must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, baseCurrency, issueDate, differs, ready])

  const parsed = parseExchangeRate(text)
  const rate = differs && parsed.ok ? parsed.rate : null
  const valid = !differs || parsed.ok

  return {
    differs,
    baseCurrency,
    text,
    /** Typed by a person — it stays until they clear it. */
    setManual: (v: string) => {
      setText(v)
      setSource(v.trim() === "" ? null : "MANUAL")
      setDate(null)
    },
    /** Back to the ECB's rate for the issue date. */
    resetToEcb: () => {
      setSource(null)
      fetchEcb()
    },
    rate,
    source,
    date,
    loading,
    valid,
    /** An amount in the invoice's currency, in the organization's — or null when no rate is known. */
    toBase: (amount: number) => toOrganizationCurrency(amount, currency, baseCurrency, rate),
    /** What a save sends. Null clears it on purpose, so the server does not ask the ECB behind the screen's back. */
    payload: differs
      ? { exchangeRate: rate, exchangeRateSource: rate != null ? source : null, exchangeRateDate: rate != null ? date : null }
      : { exchangeRate: null, exchangeRateSource: null, exchangeRateDate: null },
  }
}

export type ExchangeRateState = ReturnType<typeof useExchangeRate>
