"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from "react-leaflet"
import L from "leaflet"
import { Search, Loader2, MapPin, Keyboard } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

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

interface GeoResult {
  display_name: string
  lat: string
  lon: string
}

interface LocationPickerProps {
  lat: number | null
  lng: number | null
  radius: number
  address: string
  onLocationChange: (lat: number, lng: number) => void
  onAddressChange: (address: string) => void
}

function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

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
  const [searchQuery, setSearchQuery] = useState("")
  const [results, setResults] = useState<GeoResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [manualLat, setManualLat] = useState(lat?.toString() || "")
  const [manualLng, setManualLng] = useState(lng?.toString() || "")
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Sync manual inputs when lat/lng change from map click or search
  useEffect(() => {
    if (lat !== null) setManualLat(lat.toFixed(6))
    if (lng !== null) setManualLng(lng.toFixed(6))
  }, [lat, lng])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Search using both Photon and Nominatim for wider coverage
  const searchAddress = useCallback(async (query: string) => {
    if (query.length < 3) {
      setResults([])
      return
    }
    setIsSearching(true)
    try {
      // Run Photon and Nominatim in parallel
      const [photonRes, nominatimRes] = await Promise.allSettled([
        fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=3`)
          .then((r) => r.json())
          .then((data) =>
            (data.features || []).map((f: any) => ({
              display_name: [
                f.properties.name,
                f.properties.street,
                f.properties.city,
                f.properties.state,
                f.properties.country,
              ].filter(Boolean).join(", "),
              lat: f.geometry.coordinates[1].toString(),
              lon: f.geometry.coordinates[0].toString(),
            }))
          ),
        fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=3`,
          { headers: { "Accept-Language": "en,de" } }
        )
          .then((r) => r.json())
          .then((data) =>
            data.map((r: any) => ({
              display_name: r.display_name,
              lat: r.lat,
              lon: r.lon,
            }))
          ),
      ])

      // Combine and deduplicate
      const photonResults = photonRes.status === "fulfilled" ? photonRes.value : []
      const nominatimResults = nominatimRes.status === "fulfilled" ? nominatimRes.value : []
      const combined = [...photonResults, ...nominatimResults]

      // Deduplicate by proximity (within ~100m)
      const unique: GeoResult[] = []
      for (const r of combined) {
        const isDupe = unique.some(
          (u) =>
            Math.abs(parseFloat(u.lat) - parseFloat(r.lat)) < 0.001 &&
            Math.abs(parseFloat(u.lon) - parseFloat(r.lon)) < 0.001
        )
        if (!isDupe) unique.push(r)
      }

      setResults(unique.slice(0, 5))
      setShowResults(true)
    } catch {
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchAddress(value), 400)
  }

  const selectResult = (result: GeoResult) => {
    const newLat = parseFloat(result.lat)
    const newLng = parseFloat(result.lon)
    onLocationChange(newLat, newLng)
    onAddressChange(result.display_name)
    setSearchQuery("")
    setShowResults(false)
    setResults([])
  }

  const handleMapClick = useCallback(
    async (clickLat: number, clickLng: number) => {
      onLocationChange(clickLat, clickLng)
      // Reverse geocode with Nominatim
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${clickLat}&lon=${clickLng}&addressdetails=1`,
          { headers: { "Accept-Language": "en,de" } }
        )
        const data = await res.json()
        if (data.display_name) {
          onAddressChange(data.display_name)
        }
      } catch {
        // Ignore
      }
    },
    [onLocationChange, onAddressChange]
  )

  const applyManualCoords = (newLat: string, newLng: string) => {
    const latNum = parseFloat(newLat)
    const lngNum = parseFloat(newLng)
    if (!isNaN(latNum) && !isNaN(lngNum) && latNum >= -90 && latNum <= 90 && lngNum >= -180 && lngNum <= 180) {
      onLocationChange(latNum, lngNum)
    }
  }

  const handleLatChange = (value: string) => {
    setManualLat(value)
    applyManualCoords(value, manualLng)
  }

  const handleLngChange = (value: string) => {
    setManualLng(value)
    applyManualCoords(manualLat, value)
  }

  const mapCenter: [number, number] = lat && lng ? [lat, lng] : [48.1351, 11.582]

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div ref={wrapperRef} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search for a city, street, or landmark..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => results.length > 0 && setShowResults(true)}
            className="pl-9 pr-9"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
          )}
        </div>

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

      {/* Address + Coordinates - manual entry */}
      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">Address</Label>
          <Input
            placeholder="Type the full address manually"
            value={address}
            onChange={(e) => onAddressChange(e.target.value)}
            className="bg-white text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Latitude</Label>
            <Input
              type="number"
              step="any"
              placeholder="48.1351"
              value={manualLat}
              onChange={(e) => handleLatChange(e.target.value)}
              className="bg-white text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Longitude</Label>
            <Input
              type="number"
              step="any"
              placeholder="11.5820"
              value={manualLng}
              onChange={(e) => handleLngChange(e.target.value)}
              className="bg-white text-sm"
            />
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Search above, click on the map, or enter the address and coordinates manually.
        </p>
      </div>
    </div>
  )
}
