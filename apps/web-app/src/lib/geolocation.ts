// =============================================================================
// BROWSER GEOLOCATION
// -----------------------------------------------------------------------------
// Wraps the W3C Geolocation API for web clock-in/out.
//
// Why this is VPN-safe: navigator.geolocation resolves position from the
// operating system's location services (GPS, Wi-Fi triangulation, cellular) —
// NOT from the network/IP address. A VPN only changes the IP route, so it does
// not affect these readings. (IP-based geolocation, by contrast, WOULD be thrown
// off by a VPN — which is exactly why we never use it here.)
//
// Requirements: a secure context (HTTPS or localhost) and user permission.
// =============================================================================

export type GeolocationFailure = 'unsupported' | 'insecure' | 'denied' | 'unavailable' | 'timeout' | 'unknown';

export class GeolocationError extends Error {
  constructor(public readonly reason: GeolocationFailure) {
    super(`geolocation:${reason}`);
    this.name = 'GeolocationError';
  }
}

export interface BrowserPosition {
  lat: number;
  lng: number;
  /** Reading accuracy radius in meters (lower is better). */
  accuracy: number;
}

/**
 * Resolve the device's current position. High accuracy, fresh fix (no cache).
 * Rejects with a GeolocationError whose `reason` maps to a user-facing message.
 */
export function getBrowserPosition(opts?: { timeoutMs?: number }): Promise<BrowserPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new GeolocationError('unsupported'));
      return;
    }
    // The Geolocation API only works in a secure context.
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      reject(new GeolocationError('insecure'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => {
        const reason: GeolocationFailure =
          err.code === err.PERMISSION_DENIED
            ? 'denied'
            : err.code === err.POSITION_UNAVAILABLE
              ? 'unavailable'
              : err.code === err.TIMEOUT
                ? 'timeout'
                : 'unknown';
        reject(new GeolocationError(reason));
      },
      { enableHighAccuracy: true, timeout: opts?.timeoutMs ?? 15_000, maximumAge: 0 },
    );
  });
}

/** Great-circle distance between two points, in meters (Haversine). */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
