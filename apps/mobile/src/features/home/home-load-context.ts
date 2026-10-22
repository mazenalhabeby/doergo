import { createContext } from 'react';
import type { LoadQueue } from './load-queue';

/**
 * The home's load queue, and which card a hook is running inside.
 *
 * ⚠️ A PLAIN MODULE, NO NATIVE IMPORTS. `useLiveRefresh` reads these, and it
 * is imported by nearly every screen — pulling the card chrome (Animated,
 * theme) in with it would put native code under every one of them.
 *
 * ⚠️ BY CONTEXT, SO NO CARD CHANGES. Every card already refreshes through
 * `useLiveRefresh`; that hook finds the queue and its own card's key here and
 * asks through the queue instead of at once. A card rendered anywhere else (the
 * gallery preview) has no queue and behaves exactly as before.
 */
export const HomeLoadContext = createContext<LoadQueue | null>(null);
export const HomeCardKeyContext = createContext<string | null>(null);
