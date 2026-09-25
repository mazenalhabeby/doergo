import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Modal, Platform, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { BlurView } from 'expo-blur';

/**
 * One bottom-sheet presentation for the whole app (DRY): a blurred + dimmed
 * backdrop that FADES in, while the sheet SLIDES up — matching the break sheet.
 * Single responsibility: modal presentation + backdrop + open/close animation.
 * Callers just provide their own sheet content (bg, handle, padding) as children;
 * this owns the Modal, the tap-to-dismiss backdrop, and the animation.
 */
/*
  ⚠️ iOS WILL NOT PRESENT A MODAL WHILE ANOTHER IS DISMISSING.

  Every sheet in this app is a Modal, and this one stays mounted for 250ms
  while it animates out. So the ordinary pattern

      onPress={() => { setListOpen(false); setDetailOpen(true); }}

  mounts the second modal while the first is still leaving. The second never
  appears, and its invisible backdrop swallows every touch — the app looks
  frozen, with nothing in the logs.

  It is fixed HERE rather than at each call site because the call sites read
  perfectly and there are several of them, including two in shipped code (the
  shift-issue list handing over to the report sheet, and to the thread sheet).
  A sheet asked to open while another is leaving simply waits for it.

  ⚠️ AND THE WAIT MUST NOT DEPEND ON WHICH SHEET IS WRITTEN FIRST.

  The first cut read `dismissingUntil` synchronously in the opening sheet's
  effect — which only works if the LEAVING sheet's effect ran first, and
  effects run in the order the siblings are declared. So the same handover
  worked or failed purely on JSX order:

      <ShiftIssueListSheet …/>    <ShiftIssueThreadSheet …/>   ← works
      <ShiftIssueThreadSheet …/>  <ShiftIssueListSheet …/>     ← dead tap

  Both spellings exist in this app, so tapping an issue opened the thread on
  the home card and did nothing at all on the Time tab — the list slid away
  and the screen stayed where it was. Opening therefore yields one turn first
  and re-reads the claim afterwards, by which point every effect in the flush
  has run and the answer is the same whatever the order.

  ⚠️ AND WHERE A SHEET LEADS TO ANOTHER, PREFER STACKING TO SWAPPING.

  iOS refuses to PRESENT while dismissing; it presents ON TOP of a sheet that
  is simply standing there quite happily. So a list that opens a detail should
  leave itself open underneath:

      onOpen={(id) => { setListOpen(false); setDetailId(id); }}   ← a race
      onOpen={(id) => setDetailId(id)}                            ← no race

  There is nothing to time, and closing the detail puts the member back in the
  list they came from, which is what they expect anyway. The timing guard
  above stays for the hand-overs that genuinely replace one sheet with another
  (the issue list → the report form), and as the backstop for the next one
  somebody writes as a swap.
*/
let dismissingUntil = 0;
const EXIT_MS = 250;

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
  const [mounted, setMounted] = useState(visible);
  // Measured, not assumed — see the hook for why KeyboardAvoidingView was wrong.
  const keyboard = useKeyboardHeight();
  const overlay = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    if (visible) {
      const open = () => {
        setMounted(true);
        slide.setValue(height);
        Animated.parallel([
          Animated.timing(overlay, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.spring(slide, { toValue: 0, damping: 25, stiffness: 200, useNativeDriver: true }),
        ]).start();
      };
      /*
        Yield once, then wait out any sheet still leaving the screen. The
        first turn is what makes this independent of declaration order — see
        the note above; on its own it costs one frame nobody can see.
      */
      let timer: ReturnType<typeof setTimeout>;
      const attempt = () => {
        const wait = dismissingUntil - Date.now();
        if (wait > 0) { timer = setTimeout(attempt, wait); return; }
        open();
      };
      timer = setTimeout(attempt, 0);
      return () => clearTimeout(timer);
    }
    if (mounted) {
      // Claim the window before anything else can present into it.
      dismissingUntil = Date.now() + EXIT_MS;
      Animated.parallel([
        Animated.timing(overlay, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slide, { toValue: height, duration: EXIT_MS, useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) setMounted(false); });
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

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
