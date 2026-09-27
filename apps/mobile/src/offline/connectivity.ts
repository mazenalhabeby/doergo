import { loadNetInfo } from './native';

/**
 * Online, offline — or LIMITED: a network is there but requests are not getting
 * through. The last one is the common case on a site: a Wi-Fi with a captive
 * portal, a van's hotspot with no signal. NetInfo reports it as connected.
 *
 * So two sources combine: NetInfo for "is there a network at all", and the
 * outcome of real requests for "does it work". A request that succeeds is the
 * strongest possible evidence and immediately clears limited.
 */
export type Connectivity = 'online' | 'offline' | 'limited';

type Listener = (state: Connectivity) => void;
type KindListener = (unmetered: boolean) => void;

/** Two network errors in a row with a network present means limited. */
const FAILURES_FOR_LIMITED = 2;

export class ConnectivityMonitor {
  private network: 'up' | 'down' | 'unknown' = 'unknown';
  private consecutiveFailures = 0;
  private current: Connectivity = 'online';
  private readonly listeners = new Set<Listener>();
  private readonly kindListeners = new Set<KindListener>();
  private isUnmetered = false;
  /** A 2G/3G cellular link — up, but too thin to share six ways. */
  private isWeak = false;
  private readonly weakListeners = new Set<(weak: boolean) => void>();
  private unsubscribeNetInfo?: () => void;

  start(): void {
    const netinfo = loadNetInfo();
    if (!netinfo || this.unsubscribeNetInfo) return;
    this.unsubscribeNetInfo = netinfo.default.addEventListener((s) => {
      // isInternetReachable is null while unknown — treat as up and let real
      // requests decide.
      this.network = s.isConnected === false || s.isInternetReachable === false ? 'down' : 'up';
      if (this.network === 'up') this.consecutiveFailures = 0;
      // Wi-Fi or a cable, and not a phone's hotspot the OS knows is metered.
      const expensive = (s.details as { isConnectionExpensive?: boolean } | null)?.isConnectionExpensive;
      this.setUnmetered(this.network === 'up' && (s.type === 'wifi' || s.type === 'ethernet') && expensive !== true);
      const gen = (s.details as { cellularGeneration?: string | null } | null)?.cellularGeneration;
      this.setWeak(this.network === 'up' && s.type === 'cellular' && (gen === '2g' || gen === '3g'));
      this.recompute();
    });
  }

  stop(): void {
    this.unsubscribeNetInfo?.();
    this.unsubscribeNetInfo = undefined;
  }

  /** Feed the outcome of a real request. */
  reportRequest(ok: boolean): void {
    if (ok) {
      this.consecutiveFailures = 0;
      if (this.network === 'down') this.network = 'up';
    } else {
      this.consecutiveFailures++;
    }
    this.recompute();
  }

  /** For tests and for NetInfo-less paths. */
  setNetwork(state: 'up' | 'down'): void {
    this.network = state;
    if (state === 'up') this.consecutiveFailures = 0;
    this.recompute();
  }

  get state(): Connectivity {
    return this.current;
  }

  /** On Wi-Fi (or a cable) that is not metered — where big uploads and downloads belong. */
  get unmetered(): boolean {
    return this.isUnmetered;
  }

  /** For tests and for NetInfo-less paths. */
  setUnmetered(unmetered: boolean): void {
    if (unmetered === this.isUnmetered) return;
    this.isUnmetered = unmetered;
    for (const l of this.kindListeners) l(unmetered);
  }

  private setWeak(weak: boolean): void {
    if (weak === this.isWeak) return;
    this.isWeak = weak;
    for (const l of this.weakListeners) l(weak);
  }

  /**
   * ⭐ A SLOW LINK: a 2G/3G cellular connection, or requests failing in a row
   * (`limited`). The home loads one card at a time on it, and cards below the
   * fold wait until they are scrolled to.
   */
  get slow(): boolean {
    return this.isWeak || this.current === 'limited';
  }

  /** Called when `slow` may have changed (either half of it). */
  subscribeSlow(listener: (slow: boolean) => void): () => void {
    const onWeak = () => listener(this.slow);
    const onState = () => listener(this.slow);
    this.weakListeners.add(onWeak);
    this.listeners.add(onState);
    return () => { this.weakListeners.delete(onWeak); this.listeners.delete(onState); };
  }

  subscribeKind(listener: KindListener): () => void {
    this.kindListeners.add(listener);
    return () => this.kindListeners.delete(listener);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private recompute(): void {
    const next: Connectivity =
      this.network === 'down' ? 'offline' : this.consecutiveFailures >= FAILURES_FOR_LIMITED ? 'limited' : 'online';
    if (next === this.current) return;
    this.current = next;
    for (const l of this.listeners) l(next);
  }
}

/**
 * One connectivity monitor for the whole app, fed by every request — not only
 * the offline path — so "limited" is noticed on whatever screen fails first.
 *
 * ⚠️ HERE, NOT IN `runtime.ts`. A home widget asks "is there a network at all"
 * before it spends a request, and importing the runtime to ask that drags the
 * database, the file stores and the sync engine into every card (and into every
 * rule test that drives one). This file needs nothing but NetInfo, lazily.
 */
export const connectivity = new ConnectivityMonitor();

/**
 * NetInfo says there is no network at all — a request now cannot reach the
 * server and is not worth making. `limited` is NOT this: a network is there and
 * a request may well get through, so that case still tries.
 */
export function knownOffline(): boolean {
  return connectivity.state === 'offline';
}
