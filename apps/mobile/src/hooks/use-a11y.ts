import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Two questions the home screen's edit mode has to ask the phone.
 *
 * ⚠️ BOTH ARE LIVE. Somebody turns VoiceOver on from the side button WHILE the
 * screen is open — the arrows have to appear then, not at the next launch.
 * `live-dot.tsx` already does this for Reduce Motion; this is the same pattern
 * for both flags, in one place, because a second copy is how one of them ends
 * up without its listener.
 */

/**
 * Is a screen reader running?
 *
 * `home-screen.md` §3: *"Show visible arrows only when a screen reader is
 * running."* The arrows exist for everyone as `accessibilityActions` — reached
 * through the VoiceOver rotor and TalkBack's reading controls — and WCAG 2.5.7
 * is satisfied by those alone. Drawing them on a sighted member's home screen
 * would put two controls on every card for something neither platform shows.
 */
export function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((v) => { if (alive) setOn(v); });
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => { alive = false; sub.remove(); };
  }, []);
  return on;
}

/**
 * Has the member asked for less movement?
 *
 * §3: *"Reduce Motion: skip the spring and the neighbour animation. The order
 * still changes, instantly."* ⚠️ THE ORDER STILL CHANGES — this setting removes
 * the animation, never the function.
 */
export function useReduceMotion(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (alive) setOn(v); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOn);
    return () => { alive = false; sub.remove(); };
  }, []);
  return on;
}

/** Say the RESULT out loud — "Crew, position 2 of 4." */
export function announce(message: string): void {
  AccessibilityInfo.announceForAccessibility(message);
}
