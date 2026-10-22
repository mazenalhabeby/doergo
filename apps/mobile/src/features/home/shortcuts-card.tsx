import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { useDocumentRequirements } from '../../contexts/document-requirements-context';
import { knownEquipmentDue } from '../../lib/equipment-cache';
import { useSyncStatus } from '../../offline/offline-context';
import { destinationsFor, type Destination } from '../../lib/manage-rows';
import { over } from '../../theme/amazen';
import { selection } from '../../lib/haptics';
import { AText, Eyebrow, PrimaryButton, CardSurface } from '../../components/amazen';
import { BlurSheet } from '../../components/blur-sheet';
import { SheetPanel } from '../../components/sheet-panel';
import { SHORTCUT_GLYPHS } from './shortcut-glyphs';
import {
  MIN_TILES, SLOTS, badgeOf, groupOf, shortcutCandidates, shownShortcuts,
  smartPicks, type Badges, type ShortcutGroup,
} from './shortcuts';
import { useInGallery, usePitch } from './pitch';
import { loadShortcuts, saveShortcuts, onShortcutsChanged } from './layout-store';
import { useShortcutsEditor } from './use-shortcuts-editor';
import { GROUPS } from './shortcuts-editor-helpers';
import { CountBadge } from '../../components/amazen/count-badge';
import { useShortcutsEditorLogic } from './use-shortcuts-editor-logic';
import { ShortcutsEditorShortcutsCard } from './shortcuts-editor-shortcuts-card';

/**
 * ⭐ SHORTCUTS — `docs/design/shortcuts`. Four tiles the member chooses.
 *
 * Added, it arrives with four SMART PICKS (what is waiting, then the actions,
 * then the member's places). Edit opens the same popup as the shift widget:
 * every shortcut the member may open, and four slots to fill. Once chosen the
 * tiles keep their order; badges still show on them.
 *
 * ⚠️ NO "WAITING ELSEWHERE" LINE. The action strip under the header already
 * says what is waiting on the member; a second line here only repeated it.
 *
 * ⚠️ NO REQUEST OF ITS OWN. The tiles are a filter over a local table, and a
 * badge only shows a count something else already holds (spec §5): documents
 * from the requirements context, the queue from the phone's own outbox.
 */

/** Counts already on the phone — never fetched to decorate a tile. */
function useShortcutBadges(): Badges {
  const docs = useDocumentRequirements();
  const { snapshot } = useSyncStatus();
  const { user } = useAuth();
  const equipmentDue = knownEquipmentDue(user?.id);
  return useMemo(() => ({
    'documents.due': docs.toUpload.length + docs.rejected.length,
    'documents.toSign': docs.toSign.length,
    'sync.queued': snapshot.waiting + snapshot.attention,
    // What My equipment last read — the tile declared this badge and nothing ever filled it.
    'assets.due': equipmentDue,
  }), [docs.toUpload.length, docs.rejected.length, docs.toSign.length, snapshot.waiting, snapshot.attention, equipmentDue]);
}

/*
  Added from the gallery → the member chooses their four straight away. A flag
  rather than a prop: the registry renders every card the same way, and only
  the HOME instance (never the gallery's preview) answers it.
*/
let editOnArrival = false;
export function editShortcutsOnArrival(): void { editOnArrival = true; }

export function ShortcutsCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const badges = useShortcutBadges();
  const cands = useMemo(() => shortcutCandidates(destinationsFor(user as never)), [user]);

  /*
    undefined = NOT READ YET. Read as null ("never chosen") it drew the smart
    picks for a frame and then swapped them for the member's own four — tiles
    jumping under a thumb that is already moving. And the previous user's
    choice must not be shown to the next one while theirs is being read.
  */
  const [chosen, setChosen] = useState<string[] | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const inGallery = useInGallery();
  useEffect(() => {
    if (!inGallery && editOnArrival) { editOnArrival = false; setEditing(true); }
  }, [inGallery]);
  useEffect(() => {
    if (!user?.id) { setChosen(null); return; }
    setChosen(undefined);
    let live = true;
    void loadShortcuts(user.id).then((k) => { if (live) setChosen(k); });
    // Tiles set from the office land while the card is on screen.
    const off = onShortcutsChanged((id) => {
      if (id === user.id) void loadShortcuts(id).then((k) => { if (live) setChosen(k); });
    });
    return () => { live = false; off(); };
  }, [user?.id]);

  const shown = useMemo(() => shownShortcuts(chosen ?? null, cands, badges), [chosen, cands, badges]);
  usePitch({ need: 0, line: t('pitch.shortcuts') });

  const save = useCallback((keys: string[] | null) => {
    setChosen(keys);
    if (user?.id) void saveShortcuts(user.id, keys);
  }, [user?.id]);

  // One tile is a button that has learned to look like a widget (spec §6).
  if (chosen === undefined || cands.length < MIN_TILES || shown.length < MIN_TILES) return null;

  const open = (r: Destination) => router.push(r.route as Href);
  const tileBg = over(c.tile, c.well);

  return (
    <View style={style}>
      <CardSurface style={{ padding: amazen.space(3.5), paddingTop: amazen.space(4) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
          <Eyebrow tone="muted" style={{ flex: 1 }}>{t('widgets.shortcuts', { defaultValue: 'Shortcuts' })}</Eyebrow>
          <Pressable onPress={() => setEditing(true)} hitSlop={10} accessibilityRole="button">
            <AText variant="caption" tone="muted">{t('shortcutsCard.edit', { defaultValue: 'Edit' })}</AText>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: amazen.space(2.5) }}>
          {Array.from({ length: SLOTS }, (_, i) => {
            const r = shown[i];
            if (!r) return <View key={`empty-${i}`} style={{ flex: 1 }} />;
            return <Tile key={r.labelKey} r={r} count={badgeOf(r, badges)} bg={tileBg} onPress={() => open(r)} />;
          })}
        </View>

      </CardSurface>

      <ShortcutsEditor
        visible={editing}
        initial={shown.map((r) => r.labelKey)}
        cands={cands}
        badges={badges}
        onClose={() => setEditing(false)}
        onSave={(keys) => { save(keys); setEditing(false); }}
      />
    </View>
  );
}

function Tile({
  r,
  count,
  bg,
  onPress,
  size = 'rail',
}: {
  r: Destination;
  count: number;
  bg: string;
  onPress: () => void;
  size?: 'rail' | 'slot';
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const Glyph = SHORTCUT_GLYPHS[r.labelKey];
  const label = t(r.labelKey);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count ? `${label}, ${t('shortcutsCard.waiting', { count })}` : label}
      style={({ pressed }) => ({
        flex: 1, aspectRatio: 1 / 1.08, borderRadius: size === 'rail' ? 20 : 18, backgroundColor: bg,
        alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 3,
        transform: [{ scale: pressed ? 0.94 : 1 }],
      })}
    >
      {Glyph ? <Glyph size={size === 'rail' ? 26 : 22} color={c.ink} contrast={bg} /> : null}
      <AText
        variant="caption"
        tone="ink"
        numberOfLines={2}
        style={{ fontSize: 11.5, lineHeight: 13.5, textAlign: 'center' }}
      >
        {label}
      </AText>
      {count ? <CountBadge count={count} ring={c.well} style={{ position: 'absolute', top: 6, right: 6 }} /> : null}
    </Pressable>
  );
}

/**
 * Choose your four. Tap a slot, then a shortcut to put there; tap a chosen
 * shortcut (or ×) to take it off. "Smart picks" puts the suggestion back.
 */
export function ShortcutsEditor({ visible, initial, cands, badges, onClose, onSave }: {
  visible: boolean; initial: string[]; cands: Destination[]; badges: Badges;
  onClose: () => void; onSave: (keys: string[] | null) => void;
}) {
  const vm = useShortcutsEditorLogic({ visible, initial, cands, badges, onClose, onSave });
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
  } = vm;

  return (
    <BlurSheet visible={visible} onClose={onClose}>
      <ShortcutsEditorShortcutsCard vm={vm} onClose={onClose} cands={cands} badges={badges} />
    </BlurSheet>
  );
}
