import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { impact } from '@/lib/haptics';
import { LANDED_MS } from './editable-widget';

/**
 * EDITING IS A MODE, AND THIS IS ALL OF IT.
 *
 * Five things that only make sense together and had nothing to do with
 * composing a column: whether the mode is open, the tap that opens it, the
 * back press that closes it, the buzz that says it opened, and the ring on a
 * card that just arrived. They were spread through `HomeScreen`, which made
 * that file about two subjects — the arrangement, and the arranging.
 *
 * Kept in `src/home/` rather than `hooks/` because it is not general: it knows
 * what a widget key is and how long a new card wears its ring.
 */
interface HomeEditing {
  editing: boolean;
  /** Open the mode. Buzzes once, and only when it was not already open. */
  enter: () => void;
  /** Close it. Done, the Android back press, and a tap below the column. */
  leave: () => void;
  /** The widgets that just arrived from the gallery, for 30 seconds. */
  landed: readonly string[];
  /** Say these have arrived — their rings start now. */
  land: (keys: readonly string[]) => void;
}

export function useHomeEditing(): HomeEditing {
  const [editing, setEditing] = useState(false);
  const [landed, setLanded] = useState<readonly string[]>([]);

  /*
    ⚠️ THE BUZZ IS THE ONLY THING THAT SAYS A 500ms HOLD WORKED.

    It fires inside the updater so it cannot fire twice: a second long press
    while the mode is already open is a member reaching for a card, not opening
    anything, and buzzing at them again says something happened when nothing
    did.
  */
  const enter = useCallback(() => {
    setEditing((on) => {
      if (!on) impact('light');
      return true;
    });
  }, []);

  const leave = useCallback(() => setEditing(false), []);

  /*
    ⚠️ THE ANDROID BACK GESTURE LEAVES THE MODE, IT DOES NOT LEAVE THE SCREEN.

    Editing is a mode, and back is what an Android member presses to get out of
    one. Without this it takes them off Home entirely, which reads as the app
    throwing away what they were in the middle of doing — and the arrangement
    IS saved, so it is also a lie.

    It returns `true` only while the mode is on, so every other back press on
    Home behaves exactly as it did. No-op on iOS, which has no hardware back.
  */
  useEffect(() => {
    if (!editing) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setEditing(false);
      return true;
    });
    return () => sub.remove();
  }, [editing]);

  /*
    The ring lasts exactly as long as the design says and not a render longer.
    ⚠️ Cleared on unmount: a member who adds a widget and changes tab left a
    timer holding a setter for a screen that is gone.
  */
  const ring = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (ring.current) clearTimeout(ring.current); }, []);
  const land = useCallback((keys: readonly string[]) => {
    setLanded(keys);
    if (ring.current) clearTimeout(ring.current);
    ring.current = setTimeout(() => setLanded([]), LANDED_MS);
  }, []);

  return { editing, enter, leave, landed, land };
}
