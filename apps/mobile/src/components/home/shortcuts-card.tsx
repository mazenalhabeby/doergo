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
import { AText, Eyebrow, PrimaryButton, CardSurface } from '../amazen';
import { BlurSheet } from '../blur-sheet';
import { SheetPanel } from '../sheet-panel';
import { SHORTCUT_GLYPHS } from './shortcut-glyphs';
import {
  MIN_TILES, SLOTS, badgeOf, groupOf, shortcutCandidates, shownShortcuts,
  smartPicks, type Badges, type ShortcutGroup,
} from '../../home/shortcuts';
import { useInGallery, usePitch } from '../../home/pitch';
import { loadShortcuts, saveShortcuts, onShortcutsChanged } from '../../home/layout-store';

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

function Tile({ r, count, bg, onPress, size = 'rail' }: { r: Destination; count: number; bg: string; onPress: () => void; size?: 'rail' | 'slot' }) {
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
      <AText variant="caption" tone="ink" numberOfLines={2} style={{ fontSize: 11.5, lineHeight: 13.5, textAlign: 'center' }}>{label}</AText>
      {count ? <Badge n={count} ring={c.well} /> : null}
    </Pressable>
  );
}

/** A count, never a dot — and capped at 9+ (spec §4). */
function Badge({ n, ring, style }: { n: number; ring: string; style?: StyleProp<ViewStyle> }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View style={[{ position: 'absolute', top: 6, right: 6, minWidth: 19, height: 19, paddingHorizontal: 4, borderRadius: 10, backgroundColor: c.warn, borderWidth: 2, borderColor: ring, alignItems: 'center', justifyContent: 'center' }, style]}>
      <AText variant="caption" numeric style={{ fontSize: 10, lineHeight: 12, color: c.warnInk }}>{n > 9 ? '9+' : String(n)}</AText>
    </View>
  );
}

const GROUPS: ShortcutGroup[] = ['waiting', 'do', 'go', 'manage'];

/**
 * Choose your four. Tap a slot, then a shortcut to put there; tap a chosen
 * shortcut (or ×) to take it off. "Smart picks" puts the suggestion back.
 */
function ShortcutsEditor({ visible, initial, cands, badges, onClose, onSave }: {
  visible: boolean; initial: string[]; cands: Destination[]; badges: Badges;
  onClose: () => void; onSave: (keys: string[] | null) => void;
}) {
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

  return (
    <BlurSheet visible={visible} onClose={onClose}>
      <SheetPanel title={t('shortcutsCard.title', { defaultValue: 'Your four shortcuts' })} onClose={onClose} maxHeightFraction={0.9}>
        <AText variant="caption" tone="muted" style={{ marginTop: 2 }}>
          {t('shortcutsCard.howTo', { defaultValue: 'Tap a slot, then pick what goes there. Tap × to empty it.' })}
        </AText>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: amazen.space(3.5) }}>
          {Array.from({ length: SLOTS }, (_, i) => {
            const r = draft[i] ? by.get(draft[i]!) : undefined;
            const on = sel === i;
            const Glyph = r ? SHORTCUT_GLYPHS[r.labelKey] : undefined;
            return (
              <Pressable
                key={i}
                onPress={() => { selection(); setSel(Math.min(i, draft.length)); }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={r ? t(r.labelKey) : t('shortcutsCard.empty', { defaultValue: 'Empty' })}
                style={{
                  flex: 1, aspectRatio: 1 / 1.08, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 3,
                  backgroundColor: on ? c.accentTint : r ? slotBg : 'transparent',
                  borderWidth: 1.5, borderStyle: r && !on ? 'solid' : 'dashed', borderColor: on ? c.accent : r ? 'transparent' : c.lineGlass,
                }}
              >
                <AText variant="caption" tone="muted" numeric style={{ position: 'absolute', top: 5, left: 8, fontSize: 9.5 }}>{i + 1}</AText>
                {r ? (
                  <>
                    {Glyph ? <Glyph size={22} color={c.ink} contrast={on ? over(c.accentTint, surface) : slotBg} /> : null}
                    <AText variant="caption" tone="ink" numberOfLines={2} style={{ fontSize: 10.5, lineHeight: 12.5, textAlign: 'center' }}>{t(r.labelKey)}</AText>
                    <Pressable onPress={() => clear(i)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('shortcutsCard.remove', { defaultValue: 'Remove' })}
                      style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: c.tile, borderWidth: 2, borderColor: surface, alignItems: 'center', justifyContent: 'center' }}>
                      <AText variant="caption" tone="ink" style={{ fontSize: 11, lineHeight: 13 }}>×</AText>
                    </Pressable>
                  </>
                ) : (
                  <AText variant="caption" tone="muted" style={{ fontSize: 11 }}>{t('shortcutsCard.empty', { defaultValue: 'Empty' })}</AText>
                )}
              </Pressable>
            );
          })}
        </View>

        <AText variant="caption" style={{ color: warn ? c.warn : c.accent, marginTop: amazen.space(2.5) }}>{hint}</AText>

        <ScrollView style={{ marginTop: amazen.space(1), maxHeight: 330 }} showsVerticalScrollIndicator={false}>
          {GROUPS.map((g) => {
            const rows = cands.filter((r) => groupOf(r, badges) === g);
            if (!rows.length) return null;
            return (
              <View key={g}>
                <Eyebrow tone="muted" style={{ marginTop: amazen.space(3.5), marginBottom: amazen.space(1) }}>{t(`shortcutsCard.group.${g}`)}</Eyebrow>
                {rows.map((r, i) => {
                  const at = draft.indexOf(r.labelKey);
                  const n = badgeOf(r, badges);
                  const Glyph = SHORTCUT_GLYPHS[r.labelKey];
                  return (
                    <Pressable
                      key={r.labelKey}
                      onPress={() => pick(r.labelKey)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: at >= 0 }}
                      style={({ pressed }) => ({
                        flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(2.25),
                        borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.lineWell, opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: slotBg, alignItems: 'center', justifyContent: 'center' }}>
                        {Glyph ? <Glyph size={20} color={c.ink} contrast={slotBg} /> : null}
                        {n ? <Badge n={n} ring={surface} style={{ top: -5, right: -7 }} /> : null}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14, lineHeight: 19 }}>{t(r.labelKey)}</AText>
                        <AText variant="caption" tone="muted" numberOfLines={1}>{n ? t('shortcutsCard.waiting', { count: n }) : t(r.descKey)}</AText>
                      </View>
                      <View style={{
                        width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: at >= 0 ? c.accentSolid : 'transparent', borderWidth: at >= 0 ? 0 : 1.6, borderColor: c.lineGlass,
                      }}>
                        {at >= 0 ? <AText variant="caption" numeric style={{ color: c.accentInk, fontSize: 11 }}>{at + 1}</AText> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: amazen.space(2.5), marginTop: amazen.space(3.5), alignItems: 'center' }}>
          <Pressable
            onPress={() => { selection(); setDraft(smartPicks(cands, badges)); setSel(0); setWarn(false); }}
            accessibilityRole="button"
            style={({ pressed }) => ({ paddingHorizontal: amazen.space(4), paddingVertical: amazen.space(3.25), borderRadius: 999, borderWidth: 1, borderColor: c.lineGlass, opacity: pressed ? 0.7 : 1 })}
          >
            <AText variant="caption" tone="ink" style={{ fontSize: 13.5 }}>{t('shortcutsCard.smart', { defaultValue: 'Smart picks' })}</AText>
          </Pressable>
          <PrimaryButton label={t('common.save', { defaultValue: 'Save' })} onPress={saveDraft} style={{ flex: 1 }} />
        </View>
      </SheetPanel>
    </BlurSheet>
  );
}
