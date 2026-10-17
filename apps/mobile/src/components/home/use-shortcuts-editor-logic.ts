import { type Destination } from '../../lib/manage-rows';
import { type Badges } from '../../home/shortcuts';
import { useShortcutsEditor } from './use-shortcuts-editor';

/** ShortcutsEditor's state and handlers — everything before its markup, moved here unchanged. */
export function useShortcutsEditorLogic({ visible, initial, cands, badges, onClose, onSave }: Pick<{
  visible: boolean; initial: string[]; cands: Destination[]; badges: Badges;
  onClose: () => void; onSave: (keys: string[] | null) => void;
}, 'visible' | 'initial' | 'cands' | 'badges' | 'onClose' | 'onSave'>) {
  const {
    amazen,
    c,
    t,
    draft,
    setDraft,
    sel,
    setSel,
    warn,
    setWarn,
    by,
    surface,
    slotBg,
    pick,
    clear,
    saveDraft,
    hint,
  } = useShortcutsEditor({ visible, initial, cands, badges, onClose, onSave });

  return {
    amazen,
    c,
    t,
    draft,
    setDraft,
    sel,
    setSel,
    warn,
    setWarn,
    by,
    surface,
    slotBg,
    pick,
    clear,
    saveDraft,
    hint,
  };
}

/** What ShortcutsEditor and its sections read. */
export type ShortcutsEditorState = ReturnType<typeof useShortcutsEditorLogic>;
