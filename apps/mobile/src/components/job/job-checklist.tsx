import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { tasksApi } from '../../lib/api';
import { AText, Well } from '../amazen';
import { TickGlyph } from './job-glyphs';
import { SectionLabel } from './job-ui';
import { tickOptimistic, type CheckItem, type ChecklistMode } from './job-logic';

/**
 * The checklist — TICKABLE by the person doing the job at a step that opens
 * it (`checklist` capability), a read-only count everywhere else.
 *
 * ⚠️ A TICK IS OPTIMISTIC AND ROLLS BACK ALONE. The box moves under the thumb
 * at once; if the server refuses, only that box moves back and the member is
 * told. `tickOptimistic` in `job-logic.ts` is the rule, and is tested.
 *
 * ⚠️ NO SIGNAL, NO TICK. There is no outbox operation for a checklist item,
 * so a tick made offline would be lost in silence. The boxes stay, still, with
 * a line that says why.
 */
export function JobChecklist({
  taskId,
  items: fromServer,
  mode,
  opensAtLabel,
}: {
  taskId: string;
  items: CheckItem[];
  mode: ChecklistMode;
  /** The step at which ticking opens, for the read-only line. */
  opensAtLabel: string | null;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const c = amazen.color;
  const [items, setItems] = useState<CheckItem[]>(() => sorted(fromServer));
  const inFlight = useRef(0);
  // The server's copy wins again once nothing is in flight — a socket refresh after a tick converges here.
  const key = fromServer.map((i) => `${i.id}:${i.isCompleted}`).join('|');
  useEffect(() => {
    if (inFlight.current === 0) setItems(sorted(fromServer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (items.length === 0) return null;
  const done = items.filter((i) => i.isCompleted).length;

  if (mode === 'readonly') {
    return (
      <Well style={{ paddingVertical: amazen.space(3), paddingHorizontal: amazen.space(3.5), gap: amazen.space(1.5) }}>
        <SectionLabel>{t('job.checklist.title', { done, total: items.length })}</SectionLabel>
        {opensAtLabel ? <AText variant="caption" tone="ink">{t('job.checklist.opensAt', { step: opensAtLabel })}</AText> : null}
      </Well>
    );
  }

  const tick = async (item: CheckItem) => {
    inFlight.current += 1;
    const ok = await tickOptimistic(item.id, !item.isCompleted, setItems, () => tasksApi.toggleChecklistItem(taskId, item.id, !item.isCompleted));
    inFlight.current -= 1;
    if (!ok) toast.error(t('job.checklist.failed'));
  };

  return (
    <Well style={{ paddingVertical: amazen.space(3), paddingHorizontal: amazen.space(3.5) }}>
      <SectionLabel tone={mode === 'tick' ? 'accent' : 'muted'}>{t('job.checklist.thisStep', { done, total: items.length })}</SectionLabel>
      {mode === 'offline' ? <AText variant="caption" tone="warn" style={{ marginTop: amazen.space(1) }}>{t('job.checklist.offline')}</AText> : null}
      {items.map((item) => {
        const on = item.isCompleted;
        return (
          <Pressable
            key={item.id}
            onPress={mode === 'tick' ? () => void tick(item) : undefined}
            disabled={mode !== 'tick'}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on, disabled: mode !== 'tick' }}
            accessibilityLabel={item.text}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: amazen.space(3),
              paddingVertical: amazen.space(2.25), minHeight: amazen.layout.tapMin,
              opacity: mode !== 'tick' ? 0.6 : pressed ? 0.75 : 1,
            })}
          >
            <View style={{
              width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
              borderWidth: 1.8, borderColor: on ? c.accentSolid : c.inkMuted, backgroundColor: on ? c.accentSolid : 'transparent',
            }}>
              {on ? <TickGlyph size={14} color={c.accentInk} /> : null}
            </View>
            <AText variant="body" numberOfLines={3} style={{ flex: 1, fontSize: 14, lineHeight: 20, color: on ? c.inkMuted : c.inkStrong, textDecorationLine: on ? 'line-through' : 'none' }}>
              {item.text}
            </AText>
          </Pressable>
        );
      })}
    </Well>
  );
}

function sorted(items: CheckItem[]): CheckItem[] {
  return [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}
