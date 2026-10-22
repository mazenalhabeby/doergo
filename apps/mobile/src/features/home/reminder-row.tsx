import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Reanimated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { AText } from '../../components/amazen';
import { Monogram } from '../../components/amazen/monogram';
import { over } from '../../theme/amazen';
import { CallGlyph } from '../../components/glyphs/work-glyphs';
import { EmailGlyph, ClientCompanyGlyph, ClientPersonGlyph } from '../../components/glyphs/crm-glyphs';
import type { DueReminder } from '../../lib/api/customers';
import { DoneRing } from './done-ring';

/** How long Undo is offered before the tick is sent. */
export const UNDO_MS = 4000;

export type RowState = 'open' | 'undo' | 'leaving';

/**
 * One reminder on the Clients card, through its whole life:
 *
 *   open    → the verb, the reason, the jade act and the ring
 *   undo    → the ring has closed; the row steps aside for "Done · Undo"
 *             with a bar running out
 *   leaving → sent; the row slides away and folds its height, then `onGone`
 *
 * ⚠️ Animated styles only (see done-ring.tsx) — and the height fold is a
 * measured height animated to 0, never a layout animation.
 */
export function ReminderRow({
  r, first, state, title, reason, due, dueColor, reasonColor, onOpen, onAct, onDone, onUndo, onGone,
}: {
  r: DueReminder;
  first: boolean;
  state: RowState;
  title: string;
  reason: string;
  due: string;
  dueColor: string;
  reasonColor: string;
  onOpen: () => void;
  onAct: () => void;
  onDone: () => void;
  onUndo: () => void;
  onGone: () => void;
}) {
  const { amazen, isDark } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const [h, setH] = useState(0);

  // 0 = the row, 1 = the undo line. Waits for the ring to finish closing.
  const swap = useSharedValue(state === 'open' ? 0 : 1);
  const bar = useSharedValue(1);
  const leave = useSharedValue(0);

  useEffect(() => {
    if (state === 'undo') {
      swap.value = withDelay(460, withTiming(1, { duration: 240 }));
      bar.value = 1;
      bar.value = withDelay(460, withTiming(0, { duration: UNDO_MS - 460, easing: Easing.linear }));
    } else if (state === 'open') {
      swap.value = withTiming(0, { duration: 200 });
      bar.value = 1;
    } else {
      leave.value = withTiming(1, { duration: 380, easing: Easing.inOut(Easing.cubic) }, (done) => { if (done) runOnJS(onGone)(); });
    }
  }, [state, swap, bar, leave, onGone]);

  const rowStyle = useAnimatedStyle(() => ({ opacity: 1 - swap.value }));
  const undoStyle = useAnimatedStyle(() => ({ opacity: swap.value }));
  const barStyle = useAnimatedStyle(() => ({ width: `${bar.value * 100}%` }));
  const wrap = useAnimatedStyle(() => (h
    ? { height: h * (1 - leave.value), opacity: 1 - leave.value, transform: [{ translateX: 28 * leave.value }] }
    : {}));

  const discPunch = isDark ? '#1fc39c' : '#0f9a7c';
  const badge = over(c.tile, c.well);
  const company = r.type === 'COMPANY';

  return (
    <Reanimated.View
      onLayout={(e) => { if (!h && state !== 'leaving') setH(e.nativeEvent.layout.height); }}
      // Clipped only while folding — the ring's pulse must be free to run past the row's edge.
      style={[{ overflow: state === 'leaving' ? 'hidden' : 'visible', borderTopWidth: first ? 0 : 1, borderTopColor: c.lineWell }, wrap]}
    >
      <Reanimated.View style={rowStyle} pointerEvents={state === 'open' ? 'auto' : 'box-none'}>
        <Pressable
          onPress={onOpen}
          disabled={state !== 'open'}
          accessibilityRole="button"
          accessibilityLabel={`${title}. ${reason}`}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: amazen.space(2.5),
            paddingVertical: amazen.space(2.5),
            opacity: pressed ? 0.75 : 1,
          })}
        >
          {/* A company is a rounded square, a person a circle — the rule `ClientAvatar` uses — with the kind as a badge. */}
          <View style={{ width: 36, height: 36 }}>
            <Monogram name={r.name} size={36} company={company} tone="tile" />
            <View
              style={{
                position: 'absolute',
                right: -3,
                bottom: -3,
                width: 16,
                height: 16,
                borderRadius: 5,
                backgroundColor: badge,
                borderWidth: 2,
                borderColor: c.well,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              {company ? (
                <ClientCompanyGlyph size={10} color={c.inkMuted} contrast={badge} />
              ) : (
                <ClientPersonGlyph size={10} color={c.inkMuted} />
              )}
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <AText variant="body" tone="strong" numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, lineHeight: 19 }}>{title}</AText>
              <AText variant="caption" numeric style={{ color: dueColor, fontSize: 11 }}>{due}</AText>
            </View>
            <AText variant="caption" numberOfLines={1} style={{ color: reasonColor, marginTop: 1 }}>{reason}</AText>
          </View>
          {r.kind !== 'OTHER' ? (
            <Pressable
              onPress={onAct}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={title}
              style={({ pressed }) => ({
                width: 36, height: 36, borderRadius: 18, backgroundColor: c.accentSolid,
                alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1,
              })}
            >
              {r.kind === 'CALL'
                ? <CallGlyph size={18} color={c.accentInk} contrast={discPunch} />
                : <EmailGlyph size={18} color={c.accentInk} contrast={discPunch} />}
            </Pressable>
          ) : null}
          <DoneRing done={state !== 'open'} onPress={onDone} label={t('clientsCard.markDone', { defaultValue: 'Mark done' })} />
        </Pressable>
      </Reanimated.View>

      {/* The undo line sits over the row it replaced — same height, so nothing below moves. */}
      <Reanimated.View
        pointerEvents={state === 'undo' ? 'auto' : 'none'}
        style={[
          {
            position: 'absolute',
            left: 46,
            right: 0,
            top: 0,
            bottom: 0,
            flexDirection: 'row',
            alignItems: 'center',
            gap: amazen.space(2),
          },
          undoStyle,
        ]}
      >
        <AText variant="body" numberOfLines={1} style={{ flex: 1, fontSize: 13.5 }}>
          <AText variant="body" tone="strong" style={{ fontSize: 13.5, fontFamily: amazen.font.sansMedium }}>
            {t('clientsCard.done', { defaultValue: 'Done.' })}
          </AText>
          <AText variant="body" tone="ink" style={{ fontSize: 13.5 }}>{' '}{r.name}</AText>
        </AText>
        <Pressable onPress={onUndo} hitSlop={10} accessibilityRole="button" style={{ paddingVertical: 6, paddingHorizontal: 4 }}>
          <AText variant="body" tone="accent" style={{ fontSize: 13.5, fontFamily: amazen.font.sansMedium }}>
            {t('clientsCard.undo', { defaultValue: 'Undo' })}
          </AText>
        </Pressable>
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 6,
            height: 2,
            borderRadius: 1,
            backgroundColor: c.tile,
            overflow: 'hidden',
          }}>
          <Reanimated.View style={[{ height: 2, backgroundColor: c.accent }, barStyle]} />
        </View>
      </Reanimated.View>
    </Reanimated.View>
  );
}
