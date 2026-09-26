import type { MapStyleElement } from 'react-native-maps';

/**
 * Google's map in the app's dark palette (Android; iOS follows the system
 * dark map via `userInterfaceStyle`). Quiet on purpose: the route and the pins
 * drawn over it are what the card is about, the streets are context.
 */
export const DARK_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#12181b' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7d8a94' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b0f12' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#232d31' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2d3a3f' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#6d7a83' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a1a1c' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#111a18' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
];
