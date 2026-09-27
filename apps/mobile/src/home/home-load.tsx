import React, { useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, Easing, View, type LayoutChangeEvent } from 'react-native';
import { useTheme } from '../contexts/theme-context';
import { useReduceMotion } from '../hooks/use-a11y';
import { connectivity } from '../offline/connectivity';
import { createLoadQueue, type LoadQueue, type LoadState } from './load-queue';

import { HomeCardKeyContext, HomeLoadContext } from './home-load-context';

export { HomeCardKeyContext, HomeLoadContext };

/** One queue for the life of the home, told when the signal turns slow. */
export function useHomeLoadQueue(order: readonly string[]): LoadQueue {
  const ref = useRef<LoadQueue | null>(null);
  if (!ref.current) ref.current = createLoadQueue();
  const queue = ref.current;
  useEffect(() => {
    queue.setSlow(connectivity.slow);
    return connectivity.subscribeSlow((slow) => queue.setSlow(slow));
  }, [queue]);
  const orderKey = order.join('|');
  useEffect(() => { queue.setOrder(order); }, [queue, orderKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => queue.clear(), [queue]);
  return queue;
}

function useLoadState(queue: LoadQueue | null, key: string): LoadState {
  return useSyncExternalStore(
    (cb) => (queue ? queue.subscribe(cb) : () => undefined),
    () => (queue ? queue.state(key) : 'idle'),
  );
}

/** How long an answer may take before the card says it is updating — no flicker on a fast open. */
export const UPDATING_AFTER_MS = 400;

/**
 * ⭐ ONE CARD ON THE HOME: its key for the hooks inside it, a hairline while an
 * answer is slow, and its place held while its first answer is on the way.
 *
 * ⚠️ THE PLACEHOLDER ONLY HOLDS SPACE A CARD HAS NOT TAKEN. A card that draws
 * its remembered answer at once has height, and nothing is added. A card that
 * draws nothing until it hears back (first launch) gets a quiet block of the
 * height it will have, so the cards below do not jump when it lands.
 */
export function HomeCard({ id, restHeight = 140, children }: { id: string; restHeight?: number; children: React.ReactNode }) {
  const queue = useContext(HomeLoadContext);
  const state = useLoadState(queue, id);
  const [height, setHeight] = useState<number | null>(null);
  const [slowNow, setSlowNow] = useState(false);

  useEffect(() => {
    if (state !== 'loading') { setSlowNow(false); return; }
    const started = queue?.startedAt(id) ?? Date.now();
    const t = setTimeout(() => setSlowNow(true), Math.max(0, UPDATING_AFTER_MS - (Date.now() - started)));
    return () => clearTimeout(t);
  }, [state, queue, id]);

  const onLayout = (e: LayoutChangeEvent) => setHeight(Math.round(e.nativeEvent.layout.height));
  const empty = height !== null && height < 4;
  const holding = empty && state !== 'idle';

  return (
    <HomeCardKeyContext.Provider value={id}>
      <View>
        <View onLayout={onLayout}>{children}</View>
        {holding ? <Placeholder height={restHeight} /> : null}
        {slowNow && !holding ? <Updating /> : null}
      </View>
    </HomeCardKeyContext.Provider>
  );
}

/** A quiet block the card's height. No shimmer: a moving placeholder is a spinner in disguise. */
function Placeholder({ height }: { height: number }) {
  const { amazen } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height, borderRadius: 24, backgroundColor: amazen.color.tile, opacity: 0.6 }}
    />
  );
}

/** A thin line across the top of the card, gliding — "a newer answer is on its way". */
function Updating() {
  const { amazen } = useTheme();
  const reduce = useReduceMotion();
  const x = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);
  useEffect(() => {
    if (reduce || !w) return;
    const loop = Animated.loop(Animated.timing(x, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduce, w, x]);
  const bar = Math.max(24, w * 0.35);
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ position: 'absolute', top: 1, left: 28, right: 28, height: 2, borderRadius: 1, overflow: 'hidden' }}
    >
      <Animated.View
        style={{
          width: reduce ? '100%' : bar,
          height: 2,
          borderRadius: 1,
          backgroundColor: amazen.color.accent,
          opacity: reduce ? 0.5 : 0.9,
          transform: reduce ? [] : [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-bar, w] }) }],
        }}
      />
    </View>
  );
}
