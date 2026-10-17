import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { type Destination } from '../../lib/manage-rows';
import { over } from '../../theme/amazen';
import { selection } from '../../lib/haptics';
import { MIN_TILES, SLOTS, type Badges } from '../../home/shortcuts';

/** ShortcutsEditor's state and handlers — everything before its markup, moved here unchanged. */
export function useShortcutsEditor({ visible, initial, cands, badges, onClose, onSave }: Pick<{
  visible: boolean; initial: string[]; cands: Destination[]; badges: Badges;
  onClose: () => void; onSave: (keys: string[] | null) => void;
}, 'visible' | 'initial' | 'cands' | 'badges' | 'onClose' | 'onSave'>) {
  const { amazen, colors } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string[]>(initial);
  const [sel, setSel] = useState(0);
  const [warn, setWarn] = useState(false);

  useEffect(() => {
    if (visible) { setDraft(initial); setSel(Math.min(initial.length, SLOTS - 1)); setWarn(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const by = useMemo(() => new Map(cands.map((r) => [r.labelKey, r])), [cands]);
  const surface = colors.card;
  const slotBg = over(c.tile, surface);

  const pick = (key: string) => {
    selection();
    setWarn(false);
    const at = draft.indexOf(key);
    if (at >= 0) {
      const next = draft.filter((k) => k !== key);
      setDraft(next);
      setSel(Math.min(sel, next.length));
      return;
    }
    const next = [...draft];
    if (sel < next.length) next[sel] = key; else next.push(key);
    setDraft(next);
    setSel(next.length < SLOTS ? next.length : Math.min(sel + 1, SLOTS - 1));
  };
  const clear = (i: number) => {
    selection();
    setDraft((d) => d.filter((_, j) => j !== i));
    setSel(i);
  };
  const saveDraft = () => {
    if (draft.length < MIN_TILES) { setWarn(true); return; }
    onSave(draft);
  };

  const hint = warn
    ? t('shortcutsCard.atLeastTwo', { defaultValue: 'Choose at least two. One tile is a button, not a widget.' })
    : draft[sel] && by.get(draft[sel]!)
      ? t('shortcutsCard.replacing', { name: t(by.get(draft[sel]!)!.labelKey), n: sel + 1 })
      : t('shortcutsCard.choosing', { n: sel + 1 });

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
