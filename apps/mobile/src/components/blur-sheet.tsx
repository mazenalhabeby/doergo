import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Modal, Platform, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { BlurView } from 'expo-blur';

/**
 * One bottom-sheet presentation for the whole app (DRY): a blurred + dimmed
 * backdrop that FADES in, while the sheet SLIDES up.
 *
 * Callers bring their own surface (see `SheetPanel`); this owns the Modal, the
 * tap-to-dismiss backdrop, the animation — and the rule below.
 */

/*
  ⚠️ THERE IS EXACTLY ONE MODAL SLOT IN THIS APP, AND IT IS NOT A METAPHOR.

  Every sheet here is a `<Modal>`, and on the New Architecture React Native
  presents each one from the SAME host view controller. So two can never be on
  screen together, and a second one asked for while the first is still there is
  refused outright by UIKit — printed to the device log, invisible to the app:

      Attempt to present <RCTFabricModalHostViewController: 0x1684cd600>
        on <ExpoScreenOrientation.ScreenOrientationViewController>
        which is already presenting <RCTFabricModalHostViewController: …>.

  That is what the ordinary hand-over does:

      onPress={() => { setListOpen(false); setDetailOpen(true); }}

  Both state changes land in one commit, the detail's Modal mounts while the
  list's is still there, and the present is dropped. The member taps a row, the
  list slides away, and the screen stays exactly as it was — with a network
  request in the log proving the tap fired, which is what makes it so hard to
  see. It took three wrong fixes: a timer, then a longer timer, then STACKING
  the two, which is the one thing the platform explicitly refuses.

  So the slot is real and it is queued. A sheet asked to open while another
  holds it WAITS, and the holder hands it over only once its Modal has actually
  left the tree — not when its animation started, not after a guessed delay.

  ⚠️ RELEASE ON UNMOUNT, NOT ON `setMounted(false)`. The two are a commit
  apart, and UIKit's own dismissal is a run-loop after that; `SETTLE_MS` covers
  the second gap. Releasing at the start of the exit animation is the timer bug
  in a smaller shape.

  ⚠️ AND THE FIX IS HERE, NOT AT THE CALL SITES. They read perfectly, there are
  a dozen of them, and the next one will be written the same way.
*/
let presenting = false;
const waiting: Array<() => void> = [];
/** UIKit finishes dismissing a run-loop after the view leaves the tree. */
const SETTLE_MS = 60;

function takeSlot(run: () => void) {
  if (presenting) { waiting.push(run); return; }
  presenting = true;
  run();
}

function releaseSlot() {
  const next = waiting.shift();
  if (!next) { presenting = false; return; }
  // The slot is handed straight over — `presenting` deliberately stays true.
  setTimeout(next, SETTLE_MS);
}

export function BlurSheet({
  visible,
  onClose,
  children,
  avoidKeyboard = true,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  avoidKeyboard?: boolean;
}) {
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(false);
  // Measured, not assumed — see the hook for why KeyboardAvoidingView was wrong.
  const keyboard = useKeyboardHeight();
  const overlay = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(height)).current;
  /** Whether THIS sheet is the one holding the slot. */
  const holds = useRef(false);

  useEffect(() => {
    if (visible) {
      /* Closed again before its turn came up: give the slot straight back. */
      let abandoned = false;
      takeSlot(() => {
        if (abandoned) { releaseSlot(); return; }
        holds.current = true;
        setMounted(true);
        slide.setValue(height);
        Animated.parallel([
          Animated.timing(overlay, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.spring(slide, { toValue: 0, damping: 25, stiffness: 200, useNativeDriver: true }),
        ]).start();
      });
      return () => { abandoned = true; };
    }
    if (mounted) {
      Animated.parallel([
        Animated.timing(overlay, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slide, { toValue: height, duration: 250, useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) setMounted(false); });
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  /* ⚠️ The slot goes back only once the Modal is really gone — see above. */
  useEffect(() => {
    if (mounted || !holds.current) return;
    holds.current = false;
    const timer = setTimeout(releaseSlot, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [mounted]);

  /* A sheet torn off the screen mid-life must not take the slot with it. */
  useEffect(() => () => {
    if (holds.current) { holds.current = false; releaseSlot(); }
  }, []);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[styles.container, avoidKeyboard && { paddingBottom: keyboard }]}>
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: overlay }]}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
              <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
            </BlurView>
          ) : (
            <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)' }]} onPress={onClose} />
          )}
        </Animated.View>
        <Animated.View style={{ transform: [{ translateY: slide }] }}>{children}</Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
});
