"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from "react-leaflet"
import L from "leaflet"
import { Search, Loader2, MapPin, Keyboard, LocateFixed } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { notify } from "@/lib/toast"
import { useTranslation } from "react-i18next"
import { formatNominatimAddress, formatPhotonFeature } from "@/lib/geocode"

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
  // Google placeId — when set, coordinates are resolved on selection via
  // /geo/place (session-token pattern). Empty for fallback rows that already
  // carry lat/lon.
  place_id?: string
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
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState("")
  const [results, setResults] = useState<GeoResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [manualLat, setManualLat] = useState(lat?.toString() || "")
  const [manualLng, setManualLng] = useState(lng?.toString() || "")
  const [locating, setLocating] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  // Google Places session token: groups the as-you-type autocomplete calls with
  // the one Place Details call on selection, so the whole search bills as a
  // single (cheap) session. Reset after each selection.
  const sessionRef = useRef<string>("")

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
      // Primary: our self-hosted Photon (full-planet) via the gateway — no public
      // rate limits, no exposed key. Falls back to the public geocoders below if it
      // returns nothing (e.g. before the index finished loading, or a coverage gap).
      try {
        const geoBase = process.env.NEXT_PUBLIC_API_URL || "/api/v1"
        // One session token per search; reused across keystrokes until a pick.
        if (!sessionRef.current && typeof crypto !== "undefined" && crypto.randomUUID) {
          sessionRef.current = crypto.randomUUID()
        }
        const sess = sessionRef.current ? `&session=${encodeURIComponent(sessionRef.current)}` : ""
        const gr = await fetch(`${geoBase}/geo/search?q=${encodeURIComponent(query)}&limit=6${sess}`, { signal: AbortSignal.timeout(5000) })
        if (gr.ok) {
          const gd = await gr.json()
          const geoResults: GeoResult[] = (gd?.results || []).map(
            (r: { id?: string; label: string; lat?: number; lon?: number }) => ({
              display_name: r.label,
              lat: r.lat != null ? String(r.lat) : "",
              lon: r.lon != null ? String(r.lon) : "",
              place_id: r.id || undefined,
            })
          )
          if (geoResults.length > 0) {
            setResults(geoResults.slice(0, 5))
            setShowResults(true)
            return
          }
        }
      } catch {
        /* fall through to the public geocoders */
      }

      // Fallback: public Photon + Nominatim (wider coverage / used until self-hosted is ready)
      const [photonRes, nominatimRes] = await Promise.allSettled([
        fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=3`)
          .then((r) => r.json())
          .then((data) =>
            (data.features || []).map((f: any) => ({
              display_name: formatPhotonFeature(f.properties),
              lat: f.geometry.coordinates[1].toString(),
              lon: f.geometry.coordinates[0].toString(),
            }))
          ),
        fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(query)}&limit=3`,
          { headers: { "Accept-Language": "en,de" } }
        )
          .then((r) => r.json())
          .then((data) =>
            data.map((r: any) => ({
              display_name: formatNominatimAddress(r.address, r.display_name),
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

  const selectResult = async (result: GeoResult) => {
    setShowResults(false)
    setResults([])
    setSearchQuery("")

    // Google row: resolve coordinates now (this closes the billed session).
    if (result.place_id) {
      try {
        const geoBase = process.env.NEXT_PUBLIC_API_URL || "/api/v1"
        const sess = sessionRef.current ? `&session=${encodeURIComponent(sessionRef.current)}` : ""
        const res = await fetch(
          `${geoBase}/geo/place?id=${encodeURIComponent(result.place_id)}${sess}`,
          { signal: AbortSignal.timeout(5000) }
        )
        if (res.ok) {
          const data = await res.json()
          const r = data?.result
          if (r && typeof r.lat === "number" && typeof r.lon === "number") {
            onLocationChange(r.lat, r.lon)
            onAddressChange(r.label || result.display_name)
            sessionRef.current = "" // fresh token for the next search
            return
          }
        }
      } catch {
        /* fall through to whatever coords the row carried */
      } finally {
        sessionRef.current = ""
      }
    }

    // Fallback row (Photon/Nominatim) already carries coordinates.
    const newLat = parseFloat(result.lat)
    const newLng = parseFloat(result.lon)
    if (!Number.isNaN(newLat) && !Number.isNaN(newLng)) {
      onLocationChange(newLat, newLng)
      onAddressChange(result.display_name)
    }
  }

  const handleMapClick = useCallback(
    async (clickLat: number, clickLng: number) => {
      onLocationChange(clickLat, clickLng)
      // Reverse geocode: prefer the server-side /geo/reverse proxy (no public
      // rate limits); fall back to Nominatim (zoom=18 for building-level detail).
      try {
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
            { headers: { "Accept-Language": "en,de" } }
          )
          const data = await res.json()
          formatted = formatNominatimAddress(data.address, data.display_name)
        }
        // Only auto-fill when the field is empty — never clobber an address the
        // user typed/pasted (e.g. a precise house number OSM search can't find).
        if (formatted && !address.trim()) {
          onAddressChange(formatted)
        }
      } catch {
        // Ignore
      }
    },
    [onLocationChange, onAddressChange, address]
  )

  // Use the browser's geolocation, then drop the pin + reverse-geocode (reusing
  // the same flow as a map click). Requires HTTPS + user permission.
  const useMyLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      notify.error(t("locations.picker.notSupported"))
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        handleMapClick(pos.coords.latitude, pos.coords.longitude)
      },
      (err) => {
        setLocating(false)
        notify.error(
          err.code === err.PERMISSION_DENIED
            ? t("locations.picker.permissionDenied")
            : t("locations.picker.locationFailed"),
        )
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }, [handleMapClick])

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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("locations.picker.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => results.length > 0 && setShowResults(true)}
            className="pl-9 pr-9"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
          )}
        </div>

        {showResults && results.length > 0 && (
          <div className="absolute z-[1000] mt-1 w-full rounded-lg border bg-card shadow-lg max-h-48 overflow-y-auto">
            {results.map((result, i) => (
              <button
                key={i}
                onClick={() => selectResult(result)}
                className="flex items-start gap-2 w-full px-3 py-2.5 text-left hover:bg-accent transition-colors border-b last:border-b-0"
              >
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span className="text-sm text-foreground line-clamp-2">{result.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="relative rounded-lg overflow-hidden border border-border" style={{ height: 280 }}>
        {/* Locate-me button overlaid on the map */}
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          title={t("locations.picker.useMyLocation")}
          className="absolute right-2 top-2 z-[1000] flex items-center gap-1.5 rounded-lg border border-border bg-card/95 px-2.5 py-1.5 text-xs font-medium text-foreground shadow-md backdrop-blur transition-colors hover:bg-card disabled:opacity-60"
        >
          {locating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
          ) : (
            <LocateFixed className="h-3.5 w-3.5 text-blue-600" />
          )}
          {locating ? t("locations.picker.locating") : t("locations.picker.myLocation")}
        </button>
        <MapContainer
          center={mapCenter}
          zoom={lat && lng ? 16 : 12}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
          attributionControl={false}
        >
          <TileLayer
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
      <div className="space-y-3 rounded-lg border border-border bg-muted p-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("locations.picker.address")}</Label>
          <Input
            placeholder={t("locations.picker.addressPlaceholder")}
            value={address}
            onChange={(e) => onAddressChange(e.target.value)}
            className="bg-card text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("locations.picker.latitude")}</Label>
            <Input
              type="number"
              step="any"
              placeholder="48.1351"
              value={manualLat}
              onChange={(e) => handleLatChange(e.target.value)}
              className="bg-card text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("locations.picker.longitude")}</Label>
            <Input
              type="number"
              step="any"
              placeholder="11.5820"
              value={manualLng}
              onChange={(e) => handleLngChange(e.target.value)}
              className="bg-card text-sm"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("locations.picker.hint")}
        </p>
      </div>
    </div>
  )
}
