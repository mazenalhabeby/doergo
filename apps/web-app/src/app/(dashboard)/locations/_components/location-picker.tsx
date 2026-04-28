"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from "react-leaflet"
import L from "leaflet"
import { Search, Loader2, MapPin } from "lucide-react"
import { Input } from "@/components/ui/input"

import "leaflet/dist/leaflet.css"

// Fix Leaflet default marker icon
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
  display_name: string
  lat: string
  lon: string
  address?: Record<string, string>
}

interface LocationPickerProps {
  lat: number | null
  lng: number | null
  radius: number
  address: string
  onLocationChange: (lat: number, lng: number) => void
  onAddressChange: (address: string) => void
}

// Component that handles map click events
function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

// Component that pans the map to a position
function MapPanner({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 15))
  }, [map, lat, lng])
  return null
}

export default function LocationPicker({
  lat,
  lng,
  radius,
  address,
  onLocationChange,
  onAddressChange,
}: LocationPickerProps) {
  const [searchQuery, setSearchQuery] = useState(address)
  const [results, setResults] = useState<NominatimResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const searchAddress = useCallback(async (query: string) => {
    if (query.length < 3) {
      setResults([])
      return
    }
    setIsSearching(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
        { headers: { "Accept-Language": "en,de" } }
      )
      const data: NominatimResult[] = await res.json()
      setResults(data)
      setShowResults(true)
    } catch {
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleInputChange = (value: string) => {
    setSearchQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchAddress(value), 400)
  }

  const selectResult = (result: NominatimResult) => {
    const newLat = parseFloat(result.lat)
    const newLng = parseFloat(result.lon)
    onLocationChange(newLat, newLng)
    onAddressChange(result.display_name)
    setSearchQuery(result.display_name)
    setShowResults(false)
    setResults([])
  }

  const handleMapClick = useCallback(
    async (clickLat: number, clickLng: number) => {
      onLocationChange(clickLat, clickLng)
      // Reverse geocode
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${clickLat}&lon=${clickLng}&addressdetails=1`,
          { headers: { "Accept-Language": "en,de" } }
        )
        const data = await res.json()
        if (data.display_name) {
          onAddressChange(data.display_name)
          setSearchQuery(data.display_name)
        }
      } catch {
        // Ignore reverse geocode errors
      }
    },
    [onLocationChange, onAddressChange]
  )

  const mapCenter: [number, number] = lat && lng ? [lat, lng] : [48.1351, 11.582]

  return (
    <div className="space-y-3">
      {/* Address Search */}
      <div ref={wrapperRef} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search address..."
            value={searchQuery}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => results.length > 0 && setShowResults(true)}
            className="pl-9 pr-9"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
          )}
        </div>

        {/* Search Results Dropdown */}
        {showResults && results.length > 0 && (
          <div className="absolute z-[1000] mt-1 w-full rounded-lg border bg-white shadow-lg max-h-48 overflow-y-auto">
            {results.map((result, i) => (
              <button
                key={i}
                onClick={() => selectResult(result)}
                className="flex items-start gap-2 w-full px-3 py-2.5 text-left hover:bg-slate-50 transition-colors border-b last:border-b-0"
              >
                <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                <span className="text-sm text-slate-700 line-clamp-2">{result.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="rounded-lg overflow-hidden border border-slate-200" style={{ height: 280 }}>
        <MapContainer
          center={mapCenter}
          zoom={lat && lng ? 16 : 12}
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
              <MapPanner lat={lat} lng={lng} />
              <Marker position={[lat, lng]} icon={markerIcon} />
              <Circle
                center={[lat, lng]}
                radius={radius}
                pathOptions={{
                  color: "#059669",
                  fillColor: "#059669",
                  fillOpacity: 0.15,
                  weight: 2,
                }}
              />
            </>
          )}
        </MapContainer>
      </div>

      <p className="text-xs text-slate-400">
        Click on the map or search an address to set the location. The green circle shows the geofence area.
      </p>
    </div>
  )
}
