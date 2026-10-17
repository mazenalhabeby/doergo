import { useState, useCallback, useRef, useEffect } from 'react';
import { call, E } from '../lib/api/client';

import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Keyboard,
  Platform,
} from 'react-native';
import MapView, { Marker, Region, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { getFix } from '../lib/location-fix';
import { useTranslation } from 'react-i18next';
import {
  COLORS,
  SPACING,
  RADIUS,
  FONT_SIZE,
  SHADOWS,
} from '../lib/constants';
import { useTheme } from '../contexts/theme-context';
import { useLocationSearchPicker, type LocationSearchPickerProps } from './use-location-search-picker';
import { styles } from './location-search-picker-helpers';

export function LocationSearchPicker({
  address,
  lat,
  lng,
  onLocationChange,
}: LocationSearchPickerProps) {
  const {
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
  } = useLocationSearchPicker({ address, lat, lng, onLocationChange });

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
          // Android must use Google tiles (requires the Maps SDK key baked into
          // the build); iOS stays on native Apple Maps — no key, best performance.
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          loadingEnabled
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
