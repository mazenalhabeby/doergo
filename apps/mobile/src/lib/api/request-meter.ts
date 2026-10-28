/**
 * Development only: one console line per API answer, so a person driving the app (or a script reading Metro's log)
 * can count what each screen asks — `EXPO_PUBLIC_REQUEST_METER=1 npx expo start`. Off in every build, and off by
 * default in development (it would bury every other log line).
 */
import type { ResponseObservation } from '@hbcfield/shared/client';

const ON = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_REQUEST_METER === '1';

export function meterRequest(o: Pick<ResponseObservation, 'method' | 'path' | 'status'>): void {
  if (ON) console.log(`[req] ${o.method} ${o.path} ${o.status}`);
}
