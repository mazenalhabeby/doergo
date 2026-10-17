"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { notify } from "@/lib/toast"
import { useAddressSearch, reverseGeocode, type AddressSearchResult } from "@/hooks/use-address-search"
import { useTranslation } from "react-i18next"
import { useFormatDistance } from "@/hooks/use-format-distance"
import { GEOFENCE_POLYGON_LIMITS } from "@hbcfield/shared/client"
import type { LocationPickerProps } from "./location-picker"

/** Where the map opens: with no pin yet, and its zoom once there is one. */
export const VIEW = {
  site: { center: [48.1351, 11.582] as [number, number], emptyZoom: 12, pinnedZoom: 16 },
  address: { center: [52.52, 13.405] as [number, number], emptyZoom: 4, pinnedZoom: 15 },
}

/** LocationPicker's state and handlers, moved here unchanged; called first in the component. */
export function useLocationPicker({
  lat,
  lng,
  address,
  onLocationChange,
  onAddressChange,
  variant = "site",
  onClear,
  radius,
  polygon,
  onPolygonChange,
  disabled,
}: LocationPickerProps) {
  const { t } = useTranslation()
  const formatDistance = useFormatDistance()
  const isAddress = variant === "address"
  const view = VIEW[variant]
  // Boundary editing is only offered when the caller wired the handler, so the
  // picker keeps working unchanged everywhere it is used for a pin alone.
  const canDrawBoundary = typeof onPolygonChange === "function"
  const [drawing, setDrawing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const viewRef = useRef<{ center: [number, number]; zoom: number } | null>(null)
  const ring = polygon ?? []
  const geo = useAddressSearch({ max: isAddress ? 6 : 5 })
  // `address`: the box shows the address; `site`: the box is only a search.
  const [query, setQuery] = useState(isAddress ? address : "")
  const [manualLat, setManualLat] = useState(lat?.toString() || "")
  const [manualLng, setManualLng] = useState(lng?.toString() || "")
  const [locating, setLocating] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isAddress) setQuery(address)
  }, [isAddress, address])

  // Sync manual inputs when lat/lng change from map click or search
  useEffect(() => {
    if (lat !== null) setManualLat(lat.toFixed(6))
    if (lng !== null) setManualLng(lng.toFixed(6))
  }, [lat, lng])

  const { setShowResults } = geo
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [setShowResults])

  const selectResult = async (row: AddressSearchResult) => {
    if (!isAddress) {
      geo.clear()
      setQuery("")
    }
    const picked = await geo.resolve(row)
    if (!picked) return
    onLocationChange(picked.lat, picked.lng)
    onAddressChange(picked.label)
    if (isAddress) setQuery(picked.label)
  }

  const handleClear = () => {
    setQuery("")
    geo.clear()
    onAddressChange("")
    onClear?.()
  }

  const handleMapClick = useCallback(
    async (clickLat: number, clickLng: number) => {
      if (disabled) return
      // While drawing, a click is a corner of the site — not a new pin. Sharing
      // one handler keeps the map's own click wiring in one place.
      if (drawing && onPolygonChange) {
        if (ring.length >= GEOFENCE_POLYGON_LIMITS.MAX_POINTS) {
          notify.error(
            t("locations.boundary.tooManyPoints", "A boundary can have at most {{max}} points.", {
              max: GEOFENCE_POLYGON_LIMITS.MAX_POINTS,
            }),
          )
          return
        }
        onPolygonChange([...ring, { lat: clickLat, lng: clickLng }])
        return
      }
      onLocationChange(clickLat, clickLng)
      const formatted = await reverseGeocode(clickLat, clickLng)
      // Only auto-fill when the field is empty — never clobber an address the
      // user typed/pasted (e.g. a precise house number the search can't find).
      if (formatted && !address.trim()) onAddressChange(formatted)
    },
    [disabled, onLocationChange, onAddressChange, address, drawing, onPolygonChange, ring, t],
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
  }, [handleMapClick, t])

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

  const mapCenter: [number, number] = lat && lng ? [lat, lng] : view.center

  return {
    lat,
    lng,
    address,
    onLocationChange,
    onAddressChange,
    variant,
    onClear,
    radius,
    polygon,
    onPolygonChange,
    disabled,
    t,
    formatDistance,
    isAddress,
    view,
    canDrawBoundary,
    drawing,
    setDrawing,
    expanded,
    setExpanded,
    viewRef,
    ring,
    geo,
    query,
    setQuery,
    manualLat,
    setManualLat,
    manualLng,
    setManualLng,
    locating,
    setLocating,
    wrapperRef,
    setShowResults,
    selectResult,
    handleClear,
    handleMapClick,
    useMyLocation,
    applyManualCoords,
    handleLatChange,
    handleLngChange,
    mapCenter,
  }
}

export type LocationPickerState = ReturnType<typeof useLocationPicker>
