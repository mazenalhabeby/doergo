import { useState, useCallback, useRef, useEffect } from 'react';
import { call, E } from '../lib/api/client';
import { Keyboard } from 'react-native';
import MapView, { Region } from 'react-native-maps';
import { getFix } from '../lib/location-fix';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';

export interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  // Google placeId — when set, coordinates are resolved on selection via
  // /geo/place (session-token pattern). Absent for fallback rows with lat/lon.
  gid?: string;
}

// Any unique string works as a Places session token; group as-you-type
// autocomplete calls with the one Place Details call on selection.
export function genSessionToken(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface LocationSearchPickerProps {
  address: string;
  lat: number | null;
  lng: number | null;
  onLocationChange: (address: string, lat: number | null, lng: number | null) => void;
}

/** LocationSearchPicker's state and handlers — everything before its markup, moved here unchanged. */
export function useLocationSearchPicker({
  address,
  lat,
  lng,
  onLocationChange,
}: Pick<LocationSearchPickerProps, 'address' | 'lat' | 'lng' | 'onLocationChange'>) {
  const [query, setQuery] = useState(address);
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef<string>('');
  const mapRef = useRef<MapView>(null);
  const { colors } = useTheme();
  const { t } = useTranslation();

  // Default region (Berlin)
  const defaultRegion: Region = {
    latitude: lat ?? 52.52,
    longitude: lng ?? 13.405,
    latitudeDelta: lat ? 0.01 : 10,
    longitudeDelta: lat ? 0.01 : 10,
  };

  // Sync query with address prop
  useEffect(() => {
    setQuery(address);
  }, [address]);

  // Search with debounce
  const searchAddress = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        // Our own geocoding proxy (Google, then our Photon) — through the API
        // client, so it carries the member's token like every other request.
        try {
          if (!sessionRef.current) sessionRef.current = genSessionToken();
          const gd: { results?: Array<{ id?: string; label: string; lat?: number; lon?: number }> } | null =
            await call(E.geo.search, { q, limit: 6, session: sessionRef.current });
          const mapped: NominatimResult[] = (gd?.results || []).map(
            (r: { id?: string; label: string; lat?: number; lon?: number }, i: number) => ({
              place_id: i,
              display_name: r.label,
              lat: r.lat != null ? String(r.lat) : '',
              lon: r.lon != null ? String(r.lon) : '',
              gid: r.id || undefined,
            })
          );
          if (mapped.length > 0) {
            setResults(mapped);
            setShowResults(true);
            return;
          }
        } catch {
          /* reported below as "nothing found" */
        }

        /*
          No public fallback.

          This fetched nominatim.openstreetmap.org straight from the phone when
          /geo came back empty — the customer's IP and the address they were
          typing, to a service the business has no agreement with. Nominatim
          allows one request a second from an identifying caller; every handset
          counted as its own, and there was no way to slow them down.

          The chain behind /geo is Google then our own Photon. Both empty is a
          real "no results", and a coverage gap is fixed in the Photon index.
        */
        setResults([]);
        setShowResults(false);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  // Reverse geocode
  const reverseGeocode = useCallback(
    async (rlat: number, rlng: number) => {
      onLocationChange('', rlat, rlng);
      try {
        // Through our own proxy only — see the note in the search above.
        let label = '';
        try {
          const gr: { result?: { label?: string } | null } | null = await call(E.geo.reverse, { lat: rlat, lon: rlng });
          label = gr?.result?.label || '';
        } catch {
          /* the pin still records its coordinates; only the label is missing */
        }
        if (label) {
          onLocationChange(label, rlat, rlng);
          setQuery(label);
        }
      } catch {
        // keep coords
      }
    },
    [onLocationChange]
  );

  // Select from autocomplete
  const handleSelect = async (result: NominatimResult) => {
    setShowResults(false);
    Keyboard.dismiss();

    const applyCoords = (label: string, la: number, ln: number) => {
      onLocationChange(label, la, ln);
      setQuery(label);
      mapRef.current?.animateToRegion(
        { latitude: la, longitude: ln, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        500
      );
    };

    // Google row: resolve coordinates now (this closes the billed session).
    if (result.gid) {
      try {
        const data: { result?: { label?: string; lat?: unknown; lon?: unknown } | null } | null = await call(E.geo.place, {
          id: result.gid,
          session: sessionRef.current || undefined,
        });
        const r = data?.result;
        if (r && typeof r.lat === 'number' && typeof r.lon === 'number') {
          applyCoords(r.label || result.display_name, r.lat, r.lon);
          sessionRef.current = '';
          return;
        }
      } catch {
        /* fall through */
      }
      sessionRef.current = '';
    }

    // Fallback row (Nominatim) already carries coordinates.
    const sLat = parseFloat(result.lat);
    const sLng = parseFloat(result.lon);
    if (!Number.isNaN(sLat) && !Number.isNaN(sLng)) {
      applyCoords(result.display_name, sLat, sLng);
    }
  };

  // Use current location
  const handleUseCurrentLocation = async () => {
    try {
      const loc = await getFix({ purpose: 'pick', ask: true });
      const { latitude, longitude } = loc.coords;
      mapRef.current?.animateToRegion(
        { latitude, longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        500
      );
      reverseGeocode(latitude, longitude);
    } catch {
      // ignore
    }
  };

  // Map press
  const handleMapPress = (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    reverseGeocode(latitude, longitude);
  };

  // Clear
  const handleClear = () => {
    setQuery('');
    setResults([]);
    setShowResults(false);
    onLocationChange('', null, null);
  };

  return {
    query,
    setQuery,
    results,
    isSearching,
    showResults,
    setShowResults,
    mapRef,
    colors,
    t,
    defaultRegion,
    searchAddress,
    reverseGeocode,
    handleSelect,
    handleUseCurrentLocation,
    handleMapPress,
    handleClear,
  };
}
