import { Linking, Platform } from 'react-native';

interface Place {
  locationLat?: number | null;
  locationLng?: number | null;
  locationAddress?: string | null;
}

/**
 * The phone's map app, at a job — `show` drops a pin, `navigate` starts the
 * drive. One place for both URLs, read by the job page and the Jobs tab.
 * A job with no coordinates opens nothing.
 */
export function openJobInMaps(task: Place, mode: 'show' | 'navigate'): void {
  if (task.locationLat == null || task.locationLng == null) return;
  const at = `${task.locationLat},${task.locationLng}`;
  const url = mode === 'navigate'
    ? Platform.select({ ios: `maps:0,0?daddr=${at}`, android: `google.navigation:q=${at}` })
    : Platform.select({ ios: `maps:0,0?q=${at}`, android: `geo:0,0?q=${at}(${encodeURIComponent(task.locationAddress || 'Location')})` });
  if (url) void Linking.openURL(url);
}
