import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * How much of the screen the keyboard is covering, measured.
 *
 * ⚠️ WHY NOT `KeyboardAvoidingView`. It was used in two places here and worked
 * in neither. Its `behavior` prop is required for it to do anything at all, and
 * ours was set only on iOS — so on Android the component was inert and a member
 * typing a company name could not see what they were typing. Given a behaviour
 * it is still unreliable inside a `Modal`, because Android's `adjustResize`
 * resizes the ACTIVITY window and a modal is a window of its own.
 *
 * Padding by the real height needs nothing from the window manager, so it
 * behaves the same on both platforms, inside a modal and outside one.
 *
 * ⚠️ `Will*` on iOS, `Did*` on Android, and the pairing is not cosmetic:
 * Android does not emit the `Will` events at all, so listening for them there
 * is a listener that never fires. iOS emits both, and `Will` is what keeps the
 * padding in step with the keyboard's own animation instead of jumping after it.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const on = Keyboard.addListener(show, (e) => setHeight(e.endCoordinates?.height ?? 0));
    const off = Keyboard.addListener(hide, () => setHeight(0));
    return () => {
      on.remove();
      off.remove();
    };
  }, []);

  return height;
}
