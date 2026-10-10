"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { geoFetch } from "@/lib/geocode"

/** One row of the address search. */
export interface AddressSearchResult {
  label: string
  /** Empty when the row is a Google place, resolved on selection. */
  lat: string
  lon: string
  /** Google placeId — coordinates come from /geo/place on selection. */
  placeId?: string
}

export interface ResolvedAddress {
  label: string
  lat: number
  lng: number
}

/**
 * Address search through our own /geo proxy, and nothing else.
 *
 * There is no public fallback. Pickers used to fetch nominatim.openstreetmap.org
 * and photon.komoot.io from the browser when /geo came back empty — sending the
 * customer's IP and the address they were typing to services the business has
 * no agreement with, at rates their policies forbid. The chain behind /geo is
 * Google then our own Photon; both empty is a genuine "no results".
 *
 * Google Places bills autocomplete + the one Place Details call on selection as
 * a single cheap SESSION when they share a token, so one token lives here until
 * a row is picked.
 */
export function useAddressSearch({ max = 6 }: { max?: number } = {}) {
  const [results, setResults] = useState<AddressSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionRef = useRef<string>("")

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  const sessionParam = () => (sessionRef.current ? `&session=${encodeURIComponent(sessionRef.current)}` : "")

  /** Search as the user types — debounced, nothing under three characters. */
  const search = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 3) {
      setResults([])
      setShowResults(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        if (!sessionRef.current && typeof crypto !== "undefined" && crypto.randomUUID) {
          sessionRef.current = crypto.randomUUID()
        }
        const res = await geoFetch(`/geo/search?q=${encodeURIComponent(query)}&limit=6${sessionParam()}`, {
          signal: AbortSignal.timeout(5000),
        })
        if (res.ok) {
          const body = await res.json()
          const rows: AddressSearchResult[] = (body?.results || []).map(
            (r: { id?: string; label: string; lat?: number; lon?: number }) => ({
              label: r.label,
              lat: r.lat != null ? String(r.lat) : "",
              lon: r.lon != null ? String(r.lon) : "",
              placeId: r.id || undefined,
            }),
          )
          if (rows.length > 0) {
            setResults(rows.slice(0, max))
            setShowResults(true)
            return
          }
        }
        setResults([])
        setShowResults(false)
      } catch {
        setResults([])
        setShowResults(false)
      } finally {
        setIsSearching(false)
      }
    }, 400)
  }, [max])

  /** The coordinates of a picked row (a Google row is resolved now, closing its session). */
  const resolve = useCallback(async (row: AddressSearchResult): Promise<ResolvedAddress | null> => {
    setShowResults(false)
    if (row.placeId) {
      try {
        const res = await geoFetch(`/geo/place?id=${encodeURIComponent(row.placeId)}${sessionParam()}`, {
          signal: AbortSignal.timeout(5000),
        })
        if (res.ok) {
          const r = (await res.json())?.result
          if (r && typeof r.lat === "number" && typeof r.lon === "number") {
            return { label: r.label || row.label, lat: r.lat, lng: r.lon }
          }
        }
      } catch {
        /* fall through to whatever coordinates the row carried */
      } finally {
        sessionRef.current = "" // a fresh token for the next search
      }
    }
    const lat = parseFloat(row.lat)
    const lng = parseFloat(row.lon)
    return Number.isNaN(lat) || Number.isNaN(lng) ? null : { label: row.label, lat, lng }
  }, [])

  const clear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setResults([])
    setShowResults(false)
  }, [])

  return { results, isSearching, showResults, setShowResults, search, resolve, clear }
}

/** The address at a point, through our own proxy; "" when there is none. */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await geoFetch(`/geo/reverse?lat=${lat}&lon=${lng}`, { signal: AbortSignal.timeout(5000) })
    if (res.ok) return (await res.json())?.result?.label || ""
  } catch {
    /* the click still records its coordinates; only the label is missing */
  }
  return ""
}
