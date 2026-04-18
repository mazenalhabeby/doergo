import { useState, useCallback, useRef, useEffect } from 'react';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Keyboard,
  Platform,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  FONT_WEIGHT,
  SHADOWS,
} from '../lib/constants';
import { useTheme } from '../contexts/theme-context';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface LocationSearchPickerProps {
  address: string;
  lat: number | null;
  lng: number | null;
  onLocationChange: (address: string, lat: number | null, lng: number | null) => void;
}

export function LocationSearchPicker({
  address,
  lat,
  lng,
  onLocationChange,
}: LocationSearchPickerProps) {
  const [query, setQuery] = useState(address);
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        const res = await fetch(
          `${NOMINATIM_BASE}/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1`,
          { headers: { 'Accept-Language': 'en', 'User-Agent': 'HBCField/1.0 (hbcfield.com)' } }
        );
        const data: NominatimResult[] = await res.json();
        setResults(data);
        setShowResults(data.length > 0);
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
        const res = await fetch(
          `${NOMINATIM_BASE}/reverse?format=json&lat=${rlat}&lon=${rlng}&addressdetails=1`,
          { headers: { 'Accept-Language': 'en', 'User-Agent': 'HBCField/1.0 (hbcfield.com)' } }
        );
        const data = await res.json();
        if (data.display_name) {
          onLocationChange(data.display_name, rlat, rlng);
          setQuery(data.display_name);
        }
      } catch {
        // keep coords
      }
    },
    [onLocationChange]
  );

  // Select from autocomplete
  const handleSelect = (result: NominatimResult) => {
    const sLat = parseFloat(result.lat);
    const sLng = parseFloat(result.lon);
    onLocationChange(result.display_name, sLat, sLng);
    setQuery(result.display_name);
    setShowResults(false);
    Keyboard.dismiss();
    mapRef.current?.animateToRegion(
      { latitude: sLat, longitude: sLng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      500
    );
  };

  // Use current location
  const handleUseCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
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

  return (
    <View style={styles.container}>
      {/* Search input */}
      <View style={[styles.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder={t('components.locationPicker.searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            searchAddress(t);
          }}
          onFocus={() => {
            if (results.length > 0) setShowResults(true);
          }}
          returnKeyType="search"
        />
        {isSearching && <ActivityIndicator size="small" color={colors.textMuted} />}
        {!isSearching && query.length > 0 && (
          <TouchableOpacity onPress={handleClear}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Autocomplete results */}
      {showResults && (
        <View style={[styles.resultsContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {results.map((r) => (
            <TouchableOpacity
              key={r.place_id}
              style={styles.resultItem}
              onPress={() => handleSelect(r)}
              activeOpacity={0.6}
            >
              <Ionicons name="location" size={16} color={COLORS.primary} style={{ marginTop: 2 }} />
              <Text style={[styles.resultText, { color: colors.textPrimary }]} numberOfLines={2}>
                {r.display_name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Map */}
      <View style={[styles.mapContainer, { borderColor: colors.border }]}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={defaultRegion}
          onPress={handleMapPress}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {lat != null && lng != null && (
            <Marker
              coordinate={{ latitude: lat, longitude: lng }}
              draggable
              onDragEnd={(e) => {
                const { latitude, longitude } = e.nativeEvent.coordinate;
                reverseGeocode(latitude, longitude);
              }}
            />
          )}
        </MapView>

        {/* Current location button */}
        <TouchableOpacity
          style={[styles.myLocationButton, { backgroundColor: colors.card }]}
          onPress={handleUseCurrentLocation}
          activeOpacity={0.7}
        >
          <Ionicons name="navigate" size={20} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Coordinates hint */}
      {lat != null && lng != null && (
        <View style={styles.coordsRow}>
          <Ionicons name="location-outline" size={12} color={colors.textMuted} />
          <Text style={[styles.coordsText, { color: colors.textMuted }]}>
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.sm,
    zIndex: 10,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: Platform.OS === 'ios' ? SPACING.md : SPACING.xs,
    gap: SPACING.sm,
    zIndex: 11,
    ...SHADOWS.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZE.base,
    paddingVertical: Platform.OS === 'ios' ? 0 : SPACING.sm,
  },
  resultsContainer: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    zIndex: 12,
    elevation: 10,
    ...SHADOWS.md,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  resultText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    lineHeight: 20,
  },
  mapContainer: {
    height: 220,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
  },
  map: {
    flex: 1,
  },
  myLocationButton: {
    position: 'absolute',
    bottom: SPACING.sm,
    right: SPACING.sm,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.md,
  },
  coordsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  coordsText: {
    fontSize: FONT_SIZE.xs,
  },
});
