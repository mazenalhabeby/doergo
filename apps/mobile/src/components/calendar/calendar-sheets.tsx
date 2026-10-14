import React from 'react';
import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CALENDAR_LAYERS, type CalendarItem, type CalendarLayer } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { AText, PrimaryButton } from '../amazen';
import { JobSheet, QuietButton, SectionLabel } from '../job/job-ui';

const LAYER_COLOR: Record<CalendarLayer, string> = {
  jobs: '#7cb4ff', events: '#c4b5fd', crm: '#f0abfc', shifts: '#6ee7b7', leave: '#fcd34d', holidays: '#fda4af', documents: '#cbd5e1',
};

/**
 * Whose calendar and what to show — the web's workspace tabs and layer switches, as one sheet.
 * Counts are of what is loaded on screen; a switched-off layer is not even asked for.
 */
export function FiltersSheet({
  visible, onClose, places, spaceId, onSpace, layers, onLayers, counts, showSchedule,
}: {
  visible: boolean;
  onClose: () => void;
  places: { spaceId: string; name: string }[];
  spaceId: string | null;
  onSpace: (id: string | null) => void;
  layers: CalendarLayer[];
  onLayers: (l: CalendarLayer[]) => void;
  counts: Partial<Record<CalendarLayer, number>>;
  showSchedule: boolean;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const row = (on: boolean) => ({
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: amazen.space(2.5), padding: amazen.space(3), borderRadius: 14,
    borderWidth: 1.5, borderColor: on ? c.accent : c.lineWell, backgroundColor: on ? c.accentTint : 'transparent',
  });
  return (
    <JobSheet visible={visible} onClose={onClose} title={t('calendar.whatToShow', 'What to show')}>
      <SectionLabel>{t('calendar.whoseCalendar', 'Whose calendar')}</SectionLabel>
      <View style={{ gap: 6 }}>
        {[{ spaceId: '', name: t('calendar.myCalendar', 'My calendar') }, ...places].map((p) => {
          const on = (spaceId ?? '') === p.spaceId;
          return (
            <Pressable key={p.spaceId || 'me'} onPress={() => onSpace(p.spaceId || null)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={row(on)}>
              <AText variant="body" tone="strong" style={{ flex: 1, fontSize: 14 }}>{p.name}</AText>
              {on ? <AText variant="body" tone="accent">✓</AText> : null}
            </Pressable>
          );
        })}
      </View>
      <SectionLabel>{t('calendar.layersTitle', 'Show')}</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CALENDAR_LAYERS.map((l) => {
          const on = layers.includes(l);
          return (
            <Pressable
              key={l}
              onPress={() => onLayers(on ? layers.filter((x) => x !== l) : [...layers, l])}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={{ width: '48%', flexDirection: 'row', alignItems: 'center', gap: 8, padding: amazen.space(2.75), borderRadius: 14, backgroundColor: c.well, opacity: on ? 1 : 0.55 }}
            >
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: LAYER_COLOR[l] }} />
              <AText variant="caption" tone="strong" style={{ flex: 1, fontSize: 13 }} numberOfLines={1}>{t(`calendar.layer.${l}`)}</AText>
              <AText variant="caption" tone="muted" numeric style={{ fontSize: 11, fontFamily: amazen.font.mono }}>{counts[l] ?? 0}</AText>
            </Pressable>
          );
        })}
      </View>
      {showSchedule ? (
        <QuietButton label={t('calendar.teamSchedule', 'Team — who is off, plan cover')} tone="accent" onPress={() => { onClose(); router.push('/(app)/manage/time-off-requests' as Href); }} />
      ) : null}
    </JobSheet>
  );
}

/**
 * A leave on the calendar. Somebody's own: where it stands. A colleague's PENDING request, for
 * somebody who decides leave: the way to Approvals, where it is decided — the one place.
 */
export function LeaveSheet({ item, mine, canDecide, onClose, onChanged }: { item: CalendarItem | null; mine: boolean; canDecide: boolean; onClose: () => void; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  if (!item) return null;
  const s = new Date(`${item.start}T12:00:00`), e = new Date(`${item.end}T12:00:00`);
  const fmt = (d: Date) => d.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  const decide = !mine && canDecide && item.status === 'PENDING' && item.ref?.type === 'timeOff';
  return (
    <JobSheet
      visible={!!item}
      onClose={onClose}
      eyebrow={`${t(`calendar.leaveType.${item.note ?? 'VACATION'}`, item.note ?? '')}${item.status === 'PENDING' ? ` · ${t('calendar.requested', 'requested')}` : ''}`}
      title={item.title}
    >
      <AText variant="body" tone="ink">{item.start === item.end ? fmt(s) : `${fmt(s)} – ${fmt(e)}`}</AText>
      {decide ? (
        <PrimaryButton label={t('approvals.decideInApprovals')} onPress={() => { onClose(); router.push('/(app)/approvals?kind=request' as Href); }} />
      ) : null}
      <QuietButton
        label={mine ? t('calendar.openTimeOff', 'My time off') : t('calendar.openSchedule', 'Open in Schedule')}
        tone="accent"
        onPress={() => { onClose(); router.push((mine ? '/(app)/(tabs)/time-off' : '/(app)/manage/time-off-requests') as Href); }}
      />
    </JobSheet>
  );
}
