"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { MAP_TILE_URL, MAP_TILE_ATTRIBUTION } from "@/lib/map-tiles"
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet"
import L from "leaflet"
import { MapPin, Search, X, Loader2, Navigation } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Input } from "@/components/ui/input"
import { formatNominatimAddress, type NominatimAddress } from "@/lib/geocode"

// Custom marker icon
const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

interface NominatimResult {
  place_id: number
  display_name: string
  address?: NominatimAddress
  lat: string
  lon: string
  // Google placeId — when set, coordinates are resolved on selection via
  // /geo/place (session-token pattern). Absent for fallback rows with lat/lon.
  gid?: string
}

interface LocationPickerProps {
  address: string
  lat: number | null
  lng: number | null
  onLocationChange: (address: string, lat: number | null, lng: number | null) => void
  disabled?: boolean
}

// Component to handle map clicks
function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

// Component to recenter map
function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lng], 15, { animate: true })
  }, [map, lat, lng])
  return null
}

export function LocationPicker({ address, lat, lng, onLocationChange, disabled }: LocationPickerProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState(address)
  const [results, setResults] = useState<NominatimResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Google Places session token: groups the as-you-type autocomplete calls with
  // the one Place Details call on selection (billed as a single cheap session).
  const sessionRef = useRef<string>("")

  // Default center (Berlin if no location)
  const mapCenter: [number, number] = lat && lng ? [lat, lng] : [52.52, 13.405]

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Sync query with address prop
  useEffect(() => {
    setQuery(address)
  }, [address])

  // Debounced search
  const searchAddress = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (q.trim().length < 3) {
        setResults([])
        setShowResults(false)
        return
      }
      debounceRef.current = setTimeout(async () => {
        setIsSearching(true)
        try {
          // Primary: Google Places (New) via the gateway /geo proxy — Maps-quality
          // results incl. businesses. Free autocomplete with a session token.
          try {
            const geoBase = process.env.NEXT_PUBLIC_API_URL || "/api/v1"
            if (!sessionRef.current && typeof crypto !== "undefined" && crypto.randomUUID) {
              sessionRef.current = crypto.randomUUID()
            }
            const sess = sessionRef.current ? `&session=${encodeURIComponent(sessionRef.current)}` : ""
            const gr = await fetch(`${geoBase}/geo/search?q=${encodeURIComponent(q)}&limit=6${sess}`, {
              signal: AbortSignal.timeout(5000),
            })
            if (gr.ok) {
              const gd = await gr.json()
              const mapped: NominatimResult[] = (gd?.results || []).map(
                (r: { id?: string; label: string; lat?: number; lon?: number }, i: number) => ({
                  place_id: i,
                  display_name: r.label,
                  lat: r.lat != null ? String(r.lat) : "",
                  lon: r.lon != null ? String(r.lon) : "",
                  gid: r.id || undefined,
                })
              )
              if (mapped.length > 0) {
                setResults(mapped)
                setShowResults(true)
                return
              }
            }
          } catch {
            /* fall through to Nominatim */
          }

          // Fallback: public Nominatim.
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1`,
            { headers: { "Accept-Language": "en" } }
          )
          const data: NominatimResult[] = await res.json()
          setResults(data)
          setShowResults(data.length > 0)
        } catch {
          setResults([])
        } finally {
          setIsSearching(false)
        }
      }, 400)
    },
    []
  )

  // Reverse geocode on map click
  const handleMapClick = useCallback(
    async (clickLat: number, clickLng: number) => {
      if (disabled) return
      // Keep any address the user already typed; just move the pin.
      onLocationChange(address, clickLat, clickLng)
      try {
        // Prefer the server-side /geo/reverse proxy (no public rate limits);
        // fall back to public Nominatim.
        let formatted = ""
        try {
          const geoBase = process.env.NEXT_PUBLIC_API_URL || "/api/v1"
          const gr = await fetch(`${geoBase}/geo/reverse?lat=${clickLat}&lon=${clickLng}`, {
            signal: AbortSignal.timeout(5000),
          })
          if (gr.ok) formatted = (await gr.json())?.result?.label || ""
        } catch {
          /* fall through to Nominatim */
        }
        if (!formatted) {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${clickLat}&lon=${clickLng}`,
            { headers: { "Accept-Language": "en" } }
          )
          const data = await res.json()
          formatted = formatNominatimAddress(data.address, data.display_name)
        }
        // Only auto-fill when the field is empty — never clobber a typed address.
        if (formatted && !address.trim()) {
          onLocationChange(formatted, clickLat, clickLng)
          setQuery(formatted)
        }
      } catch {
        // Keep coords even if reverse geocode fails
      }
    },
    [disabled, onLocationChange, address]
  )

  // Select from autocomplete
  const handleSelect = async (result: NominatimResult) => {
    setShowResults(false)

    // Google row: resolve coordinates now (this closes the billed session).
    if (result.gid) {
      try {
        const geoBase = process.env.NEXT_PUBLIC_API_URL || "/api/v1"
        const sess = sessionRef.current ? `&session=${encodeURIComponent(sessionRef.current)}` : ""
        const res = await fetch(`${geoBase}/geo/place?id=${encodeURIComponent(result.gid)}${sess}`, {
          signal: AbortSignal.timeout(5000),
        })
        if (res.ok) {
          const data = await res.json()
          const r = data?.result
          if (r && typeof r.lat === "number" && typeof r.lon === "number") {
            onLocationChange(r.label || result.display_name, r.lat, r.lon)
            setQuery(r.label || result.display_name)
            sessionRef.current = "" // fresh token for the next search
            return
          }
        }
      } catch {
        /* fall through */
      }
      sessionRef.current = ""
    }

    // Fallback row (Nominatim) already carries coordinates.
    const selectedLat = parseFloat(result.lat)
    const selectedLng = parseFloat(result.lon)
    if (!Number.isNaN(selectedLat) && !Number.isNaN(selectedLng)) {
      const formatted = formatNominatimAddress(result.address, result.display_name)
      onLocationChange(formatted, selectedLat, selectedLng)
      setQuery(formatted)
    }
  }

  // Clear location
  const handleClear = () => {
    setQuery("")
    setResults([])
    setShowResults(false)
    onLocationChange("", null, null)
  }

  return (
    <div className="space-y-3">
      {/* Search input */}
      <div ref={containerRef} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={t("locationPicker.searchPlaceholder")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              searchAddress(e.target.value)
            }}
            onFocus={() => {
              if (results.length > 0) setShowResults(true)
            }}
            disabled={disabled}
            className="h-12 pl-10 pr-10 rounded-xl border-border bg-card text-base placeholder:text-muted-foreground focus:border-blue-500 focus:ring-blue-500/20"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground animate-spin" />
          )}
          {!isSearching && query && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Autocomplete dropdown */}
        {showResults && (
          <div className="absolute z-[1000] mt-1 w-full rounded-xl border border-border bg-card shadow-lg overflow-hidden">
            {results.map((r) => (
              <button
                key={r.place_id}
                type="button"
                onClick={() => handleSelect(r)}
                className="flex items-start gap-2 w-full px-3 py-2.5 text-left hover:bg-accent transition-colors"
              >
                <MapPin className="size-4 text-blue-500 mt-0.5 shrink-0" />
                <span className="text-sm text-foreground line-clamp-2">{formatNominatimAddress(r.address, r.display_name)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map - isolate stacking context so Leaflet z-indexes don't bleed out */}
      <div className="h-[280px] rounded-xl overflow-hidden border border-border" style={{ isolation: "isolate" }}>
        <MapContainer
          center={mapCenter}
          zoom={lat && lng ? 15 : 4}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
          attributionControl
        >
          <TileLayer
            url={MAP_TILE_URL}
            attribution={MAP_TILE_ATTRIBUTION}
          />
          <MapClickHandler onClick={handleMapClick} />
          {lat && lng && (
            <>
              <Marker position={[lat, lng]} icon={markerIcon} />
              <MapRecenter lat={lat} lng={lng} />
            </>
          )}
        </MapContainer>
      </div>

      {/* Selected coordinates hint */}
      {lat && lng && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Navigation className="size-3" />
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </p>
      )}
    </div>
  )
}
