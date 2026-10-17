"use client"

import { Search, Loader2, MapPin, X, Navigation } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { type LatLng } from "@hbcfield/shared/client"
import { useLocationPicker } from "./use-location-picker"
import { LocationPickerPanel } from "./location-picker-panel"

// Leaflet CSS is imported globally (app/globals.css).

export interface LocationPickerProps {
  lat: number | null
  lng: number | null
  address: string
  onLocationChange: (lat: number, lng: number) => void
  onAddressChange: (address: string) => void
  /**
   * `site` (default): a search box, then the address and the coordinates as
   * fields of their own — for a workspace, an apartment, an asset, a client address.
   * `address`: the search box IS the address, with a clear button and the
   * coordinates as a hint — for a task's destination.
   */
  variant?: "site" | "address"
  /** `address` variant: the clear button emptied the address — drop the pin too. */
  onClear?: () => void
  /** A geofence circle around the pin, in metres. Nothing is drawn without one. */
  radius?: number
  /**
   * The drawn site boundary. When present it REPLACES the radius, because an
   * address geocodes to the front door and a circle measured from there cannot
   * describe a property with a yard or several buildings.
   *
   * Optional: callers that only need a pin pass neither, and the boundary UI
   * does not appear at all.
   */
  polygon?: LatLng[] | null
  onPolygonChange?: (ring: LatLng[] | null) => void
  disabled?: boolean
}

/** The one location picker: search, pin on a map, and optionally a site's radius or drawn boundary. */
export function LocationPicker({
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
  const s = useLocationPicker({
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
  })
  const {
    t,
    isAddress,
    drawing,
    expanded,
    setExpanded,
    geo,
    query,
    setQuery,
    manualLat,
    manualLng,
    wrapperRef,
    selectResult,
    handleClear,
    handleLatChange,
    handleLngChange,
  } = s

  const mapPanel = <LocationPickerPanel s={s} />

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div ref={wrapperRef} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={isAddress ? t("locationPicker.searchPlaceholder") : t("locations.picker.searchPlaceholder")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              geo.search(e.target.value)
            }}
            onFocus={() => geo.results.length > 0 && geo.setShowResults(true)}
            disabled={disabled}
            className={
              isAddress
                ? ("h-12 pl-10 pr-10 rounded-xl border-border bg-card text-base " +
                  "placeholder:text-muted-foreground focus:border-blue-500 " +
                  "focus:ring-blue-500/20")
                : "pl-9 pr-9"
            }
          />
          {geo.isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
          )}
          {isAddress && !geo.isSearching && query && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {geo.showResults && geo.results.length > 0 && (
          <div
            className={cn(
              "absolute mt-1 w-full border bg-card shadow-lg overflow-hidden",
              isAddress ? "z-[1000] rounded-xl border-border" : "z-[20] rounded-lg max-h-48 overflow-y-auto",
            )}
          >
            {geo.results.map((result, i) => (
              <button
                key={i}
                type="button"
                onClick={() => selectResult(result)}
                className={cn(
                  "flex items-start gap-2 w-full px-3 py-2.5 text-left hover:bg-accent transition-colors",
                  !isAddress && "border-b last:border-b-0",
                )}
              >
                <MapPin
                  className={cn("h-4 w-4 mt-0.5 shrink-0", isAddress ? "text-blue-500" : "text-muted-foreground")}
                />
                <span className="text-sm text-foreground line-clamp-2">{result.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {expanded ? (
        <Dialog open onOpenChange={(open) => !open && setExpanded(false)}>
          <DialogContent
            className="flex flex-col gap-3 overflow-hidden"
            style={{ width: "95vw", maxWidth: 1400, height: "90dvh" }}
          >
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-base">
                {drawing ? t("locations.boundary.modeDraw", "Draw the site") : t("locations.picker.address")}
              </DialogTitle>
              <DialogDescription>
                {drawing
                  ? t(
                      "locations.boundary.expandedHintDraw",
                      "Click each corner of the site. Drag a point to move it, click it to remove it.",
                    )
                  : t("locations.boundary.expandedHintPin", "Click the map to place the pin.")}
              </DialogDescription>
            </DialogHeader>
            {mapPanel}
          </DialogContent>
        </Dialog>
      ) : (
        mapPanel
      )}

      {isAddress ? (
        lat && lng ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Navigation className="size-3" />
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </p>
        ) : null
      ) : (
        /* Address + Coordinates - manual entry */
        <div className="space-y-3 rounded-lg border border-border bg-muted p-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("locations.picker.address")}</Label>
            <Input
              placeholder={t("locations.picker.addressPlaceholder")}
              value={address}
              onChange={(e) => onAddressChange(e.target.value)}
              disabled={disabled}
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
                disabled={disabled}
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
                disabled={disabled}
                className="bg-card text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("locations.picker.hint")}</p>
        </div>
      )}
    </div>
  )
}

export default LocationPicker
