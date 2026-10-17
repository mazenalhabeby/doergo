/** What every request tells the rest of the app — moved here unchanged from client.ts. */
// ============================================================================
// Response observers
// ============================================================================

/**
 * What every request tells the rest of the app, without the client knowing who
 * listens: the server's clock (the anchor offline timestamps are checked
 * against) and whether the network actually worked (NetInfo alone reports a
 * site Wi-Fi with no internet as "connected").
 *
 * The offline layer subscribes; this file stays free of it.
 */
export type ResponseObservation =
  { kind: 'response'; status: number; serverTime: string | null } | { kind: 'network-error' };

export const responseObservers = new Set<(o: ResponseObservation) => void>();

export function observeResponses(cb: (o: ResponseObservation) => void): () => void {
  responseObservers.add(cb);
  return () => responseObservers.delete(cb);
}

export function notifyObservers(o: ResponseObservation) {
  for (const cb of responseObservers) {
    try {
      cb(o);
    } catch {
      /* an observer must never break a request */
    }
  }
}
