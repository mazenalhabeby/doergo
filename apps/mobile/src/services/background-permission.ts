import * as Location from 'expo-location';
import { requestBackgroundLocationConsent } from './location-consent';

/**
 * "Always" location, asked the one way the stores allow: the app's own
 * disclosure first (Google Play's prominent-disclosure rule —
 * location-consent.ts), the OS prompt only after the member accepted it.
 * The shift heartbeat and the automatic clock both ask through here.
 */
export async function ensureBackgroundLocation(): Promise<boolean> {
  const consented = await requestBackgroundLocationConsent();
  if (!consented) {
    console.log('[Location] background location disclosure declined');
    return false;
  }
  const { status } = await Location.requestBackgroundPermissionsAsync();
  if (status !== 'granted') {
    console.log('[Location] background location permission denied');
    return false;
  }
  return true;
}
