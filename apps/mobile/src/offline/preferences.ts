import AsyncStorage from '@react-native-async-storage/async-storage';

export interface OfflinePreferences {
  /** Send photos only on Wi-Fi — for somebody on a small data plan. */
  photosOnWifiOnly: boolean;
}

const DEFAULTS: OfflinePreferences = { photosOnWifiOnly: false };

/**
 * A member's own choices about how the phone syncs. On this phone only, and
 * never a reason for anything to stop working: every read falls back to the
 * default ("any connection").
 */
export class OfflinePreferencesStore {
  private value: OfflinePreferences = DEFAULTS;
  private readonly listeners = new Set<(p: OfflinePreferences) => void>();

  constructor(private readonly userId: string) {}

  private get key() {
    return `offline_prefs_${this.userId}`;
  }

  async load(): Promise<OfflinePreferences> {
    try {
      const raw = await AsyncStorage.getItem(this.key);
      this.value = { ...DEFAULTS, ...(raw ? (JSON.parse(raw) as Partial<OfflinePreferences>) : {}) };
    } catch {
      this.value = DEFAULTS;
    }
    this.emit();
    return this.value;
  }

  get current(): OfflinePreferences {
    return this.value;
  }

  async set(patch: Partial<OfflinePreferences>): Promise<void> {
    this.value = { ...this.value, ...patch };
    this.emit();
    await AsyncStorage.setItem(this.key, JSON.stringify(this.value)).catch(() => undefined);
  }

  subscribe(listener: (p: OfflinePreferences) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const l of this.listeners) l(this.value);
  }
}
