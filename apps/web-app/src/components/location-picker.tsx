"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet"
import L from "leaflet"
import { MapPin, Search, X, Loader2, Navigation } from "lucide-react"
import { Input } from "@/components/ui/input"

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
  lat: string
  lon: string
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
  const [query, setQuery] = useState(address)
  const [results, setResults] = useState<NominatimResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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
      onLocationChange("", clickLat, clickLng)
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${clickLat}&lon=${clickLng}&addressdetails=1`,
          { headers: { "Accept-Language": "en" } }
        )
        const data = await res.json()
        if (data.display_name) {
          onLocationChange(data.display_name, clickLat, clickLng)
          setQuery(data.display_name)
        }
      } catch {
        // Keep coords even if reverse geocode fails
      }
    },
    [disabled, onLocationChange]
  )

  // Select from autocomplete
  const handleSelect = (result: NominatimResult) => {
    const selectedLat = parseFloat(result.lat)
    const selectedLng = parseFloat(result.lon)
    onLocationChange(result.display_name, selectedLat, selectedLng)
    setQuery(result.display_name)
    setShowResults(false)
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
          <Input
            placeholder="Search for an address..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              searchAddress(e.target.value)
            }}
            onFocus={() => {
              if (results.length > 0) setShowResults(true)
            }}
            disabled={disabled}
            className="h-12 pl-10 pr-10 rounded-xl border-slate-200 bg-white text-base placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500/20"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 animate-spin" />
          )}
          {!isSearching && query && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Autocomplete dropdown */}
        {showResults && (
          <div className="absolute z-[1000] mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
            {results.map((r) => (
              <button
                key={r.place_id}
                type="button"
                onClick={() => handleSelect(r)}
                className="flex items-start gap-2 w-full px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
              >
                <MapPin className="size-4 text-blue-500 mt-0.5 shrink-0" />
                <span className="text-sm text-slate-700 line-clamp-2">{r.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="h-[280px] rounded-xl overflow-hidden border border-slate-200">
        <MapContainer
          center={mapCenter}
          zoom={lat && lng ? 15 : 4}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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
        <p className="text-xs text-slate-400 flex items-center gap-1">
          <Navigation className="size-3" />
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </p>
      )}
    </div>
  )
}
