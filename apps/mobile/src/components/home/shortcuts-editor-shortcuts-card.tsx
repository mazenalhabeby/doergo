import { Pressable, ScrollView, View } from 'react-native';
import { over } from '../../theme/amazen';
import { selection } from '../../lib/haptics';
import { AText, Eyebrow, PrimaryButton } from '../amazen';
import { SheetPanel } from '../sheet-panel';
import { SHORTCUT_GLYPHS } from './shortcut-glyphs';
import { SLOTS, badgeOf, groupOf, smartPicks } from '../../home/shortcuts';
import { Badge, GROUPS } from './shortcuts-editor-helpers';
import type { ShortcutsEditorState } from './use-shortcuts-editor-logic';
import type { ShortcutsEditor } from './shortcuts-card';

/** Part of ShortcutsEditor's markup, moved here unchanged; it reads the page's state from `vm`. */
export function ShortcutsEditorShortcutsCard({
  vm,
  onClose,
  cands,
  badges,
}: {
  vm: ShortcutsEditorState;
  onClose: Parameters<typeof ShortcutsEditor>[0]['onClose'];
  cands: Parameters<typeof ShortcutsEditor>[0]['cands'];
  badges: Parameters<typeof ShortcutsEditor>[0]['badges'];
}) {
  const {
    t,
    amazen,
    draft,
    by,
    sel,
    setSel,
    c,
    slotBg,
    surface,
    clear,
    warn,
    hint,
    pick,
    setDraft,
    setWarn,
    saveDraft,
  } = vm;
  return (
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
                flex: 1, aspectRatio: 1 / 1.08, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
                gap: 5, paddingHorizontal: 3,
                backgroundColor: on ? c.accentTint : r ? slotBg : 'transparent',
                borderWidth: 1.5, borderStyle: r && !on ? 'solid' : 'dashed', borderColor: on ? c.accent : r ? 'transparent' : c.lineGlass,
              }}
            >
              <AText
                variant="caption"
                tone="muted"
                numeric
                style={{ position: 'absolute', top: 5, left: 8, fontSize: 9.5 }}
              >
                {i + 1}
              </AText>
              {r ? (
                <>
                  {Glyph ? <Glyph size={22} color={c.ink} contrast={on ? over(c.accentTint, surface) : slotBg} /> : null}
                  <AText
                    variant="caption"
                    tone="ink"
                    numberOfLines={2}
                    style={{ fontSize: 10.5, lineHeight: 12.5, textAlign: 'center' }}
                  >
                    {t(r.labelKey)}
                  </AText>
                  <Pressable
                    onPress={() => clear(i)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('shortcutsCard.remove', { defaultValue: 'Remove' })}
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: c.tile,
                      borderWidth: 2,
                      borderColor: surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <AText variant="caption" tone="ink" style={{ fontSize: 11, lineHeight: 13 }}>×</AText>
                  </Pressable>
                </>
              ) : (
                <AText variant="caption" tone="muted" style={{ fontSize: 11 }}>
                  {t('shortcutsCard.empty', { defaultValue: 'Empty' })}
                </AText>
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
              <Eyebrow tone="muted" style={{ marginTop: amazen.space(3.5), marginBottom: amazen.space(1) }}>
                {t(`shortcutsCard.group.${g}`)}
              </Eyebrow>
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
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        backgroundColor: slotBg,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      {Glyph ? <Glyph size={20} color={c.ink} contrast={slotBg} /> : null}
                      {n ? <Badge n={n} ring={surface} style={{ top: -5, right: -7 }} /> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14, lineHeight: 19 }}>
                        {t(r.labelKey)}
                      </AText>
                      <AText variant="caption" tone="muted" numberOfLines={1}>
                        {n ? t('shortcutsCard.waiting', { count: n }) : t(r.descKey)}
                      </AText>
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
          style={({ pressed }) => ({
            paddingHorizontal: amazen.space(4),
            paddingVertical: amazen.space(3.25),
            borderRadius: 999,
            borderWidth: 1,
            borderColor: c.lineGlass,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <AText variant="caption" tone="ink" style={{ fontSize: 13.5 }}>
            {t('shortcutsCard.smart', { defaultValue: 'Smart picks' })}
          </AText>
        </Pressable>
        <PrimaryButton label={t('common.save', { defaultValue: 'Save' })} onPress={saveDraft} style={{ flex: 1 }} />
      </View>
    </SheetPanel>
  );
}
