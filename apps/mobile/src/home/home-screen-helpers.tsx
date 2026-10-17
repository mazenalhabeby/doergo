import { StyleSheet } from 'react-native';
import { DropSlot } from '../components/home/editable-widget';

/** HomeScreen's module-level helpers, moved here unchanged so its sections can read them too. */
/**
 * ONE home screen, composed from a registry — and edited in place.
 *
 * There used to be four — `admin-dashboard`, `hybrid-home`, `freelancer-home`,
 * `full-time-home` — each with its own fetching, skeletons and error handling.
 * The duplication was not theoretical: ALL FOUR carried the same "one unguarded
 * call kills the whole screen" bug, because the logic was written four times
 * and fixed once.
 *
 * ⚠️ THERE IS NO ARRANGE SCREEN AND NO LIST OF WIDGET NAMES.
 *
 * The version before this one was a sheet listing "Shift clock", "Crew", "My
 * work" with up/down arrows beside each. It is the obvious build and it is the
 * wrong one, for the reason both platforms settled on years ago: a list of
 * names asks somebody to decide from a word what they can decide from the
 * thing itself. "Is Crew above My work?" is a question about a picture, and
 * the picture is on the screen already. So the card you are looking at is the
 * card you hold, and the card you drag.
 *
 * The arrows did not disappear — they moved to where they belong. Every card
 * carries `accessibilityActions` for Move up / Move down / Take off my home,
 * which is what WCAG 2.5.7 actually asks for: *"all functionality that uses a
 * dragging movement can be achieved by a single pointer without dragging."*
 * They are drawn on screen only when a screen reader is running.
 *
 * ⚠️ A ROW YOU CANNOT SEE MAKES NO REQUEST AT ALL. Entitlement is asked before
 * the component mounts — nothing is visible-then-refused, and nothing fetches
 * to discover it was not allowed.
 */
/** Drawn by the library at the drop index; it takes no props. */
export const renderDropSlot = () => <DropSlot />;

/*
  ⚠️ OUT OF THE RENDER PATH. A fresh style object on every render gives the scroll
  view a new identity for its content container and rebuilds the list's own
  props diff for nothing.
*/
export const styles = StyleSheet.create({ fill: { flex: 1 } });
