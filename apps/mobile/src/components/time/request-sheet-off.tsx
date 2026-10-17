import { Pressable, View } from 'react-native';
import { AText, Sunken } from '../amazen';
import { dayKey } from './time-logic';
import { Legend } from './time-off-section-shared';
import type { RequestSheetState } from './use-request-sheet';
import type { RequestSheetView } from './request-sheet-view';
import type { RequestSheet } from './time-off-section';

/** Part of RequestSheet's markup, moved here unchanged; it reads the page's state from `vm`. */
export function RequestSheetOff({
  vm,
  canBack,
  grid,
  weekdays,
}: {
  vm: RequestSheetState;
  canBack: ReturnType<typeof RequestSheetView>['canBack'];
  grid: ReturnType<typeof RequestSheetView>['grid'];
  weekdays: Parameters<typeof RequestSheet>[0]['weekdays'];
}) {
  const {
    amazen,
    setMonth,
    month,
    t,
    i18n,
    taken,
    a,
    end,
    costDay,
    works,
    pick,
    c,
    today,
    sent,
  } = vm;
  if ((sent)) return null;
  return (
    <Sunken style={{ padding: amazen.space(3), gap: amazen.space(2) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          disabled={!canBack}
          onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('time.off.prevMonth', 'Previous month')}
          style={{ opacity: canBack ? 1 : 0.3, paddingHorizontal: amazen.space(2) }}>
          <AText variant="body" tone="strong">‹</AText>
        </Pressable>
        <AText variant="body" tone="strong" style={{ flex: 1, textAlign: 'center', fontSize: 14.5 }}>
          {month.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' })}
        </AText>
        <Pressable
          onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('time.off.nextMonth', 'Next month')}
          style={{ paddingHorizontal: amazen.space(2) }}>
          <AText variant="body" tone="strong">›</AText>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {grid.slice(0, 7).map((d) => (
          <AText key={d.getDay()} variant="caption" tone="muted" numeric style={{ flex: 1, textAlign: 'center', fontSize: 10.5 }}>
            {d.toLocaleDateString(i18n.language, { weekday: 'narrow' })}
          </AText>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {grid.map((d) => {
          const k = dayKey(d);
          const inMonth = d.getMonth() === month.getMonth();
          const mark = taken.get(k);
          const inRange = !!a && !!end && d >= a && d <= end;
          const edge = !!a && (k === dayKey(a) || (!!end && k === dayKey(end)));
          const known = costDay.get(k);
          const holiday = known?.kind === 'holiday' || known?.kind === 'half-holiday';
          const off = known ? known.cost === 0 : !works(d);
          return (
            <View key={k} style={{ width: `${100 / 7}%`, padding: 1.5 }}>
              <Pressable
                onPress={() => pick(d)}
                disabled={!!mark}
                accessibilityRole="button"
                accessibilityState={{ selected: inRange, disabled: !!mark }}
                accessibilityLabel={d.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}
                style={{
                  height: 38, borderRadius: edge ? 12 : 8, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: edge ? c.accentSolid : inRange ? c.accentTint : mark === 'approved' ? c.accentTint : 'transparent',
                  borderWidth: mark === 'pending' ? 1.5 : 0, borderColor: c.warn,
                  opacity: inMonth ? 1 : 0.35,
                }}
              >
                <AText
                  variant="caption"
                  numeric
                  style={{
                    fontSize: 13.5,
                    color: edge
                      ? c.accentInk
                      : holiday
                        ? c.critical
                        : mark === 'approved'
                          ? c.accent
                          : off
                            ? c.inkMuted
                            : dayKey(d) === dayKey(today)
                              ? c.accent
                              : c.inkStrong,
                    opacity: off && !edge && !holiday ? 0.55 : 1,
                    textDecorationLine: inRange && (off || holiday) && !edge ? 'line-through' : 'none',
                  }}
                >
                  {d.getDate()}
                </AText>
              </Pressable>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(3), alignItems: 'center' }}>
        <Legend
          swatch={
            <View
              style={{
                width: 9,
                height: 9,
                borderRadius: 3,
                backgroundColor: c.accentTint,
                borderWidth: 1,
                borderColor: c.accent,
              }}
            />
          }
          label={t('time.off.legendApproved', 'Approved')}
        />
        <Legend
          swatch={<View style={{ width: 9, height: 9, borderRadius: 3, borderWidth: 1.5, borderColor: c.warn }} />}
          label={t('time.off.legendWaiting', 'Waiting')}
        />
        {weekdays ? (
          <Legend
            swatch={
              <AText variant="caption" tone="muted" style={{ fontSize: 10, opacity: 0.55 }}>
                7
              </AText>
            }
            label={t('time.off.legendOff', 'Not a working day')}
          />
        ) : null}
      </View>
    </Sunken>
  );
}
