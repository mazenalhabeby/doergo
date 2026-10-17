import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAppStateChange } from '../../lib/app-resume';
import { Animated as RNAnimated, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { daysLate, hasAccessModule } from '@hbcfield/shared/client';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useHomeTasks } from '../../offline/tasks/use-home-tasks';
import { useOffline } from '../../offline/offline-context';
import { isUnreachable } from '../../offline/actions/unreachable';
import { FreshnessLabel } from '../../offline/components/freshness-label';
import { SyncChip } from '../../offline/components/sync-chip';
import { useShift } from '../../offline/attendance/use-shift';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { useLiveRefresh } from '../../hooks/use-live-refresh';
import { weekdayName } from '../../lib/app-dates';
import { scheduleApi } from '../../lib/api';
import type { ScheduleEntry, Task } from '../../lib/api/types';
import { AText, Eyebrow, CardSurface, WellDivider } from '../amazen';
import { LinearGradient } from 'expo-linear-gradient';
import { usePitch } from '../../home/pitch';
import {
  shapeFor, faceFor, viewAllSpaceIds, weekOf, sameDay, startOfDay, tasksOn, hasHour, isMine,
  stepsFor, isClosed, isUnderWay, shiftOn, shiftHours, nextJobAfter, figuresFor, todaysOwn,
  msUntilNextDay, withoutCanceled, stepLabelFor,
} from './my-work';
import { useTaskFlows } from './use-task-flows';
import { useMyWorkCard } from './use-my-work-card';
import {
  ActiveRow,
  PlainRow,
  ShiftList,
  Figures,
  Sentence,
  dayEyebrow,
  nextJobLine,
  siteLabel,
} from './my-work-card-helpers';

/**
 * My work — `docs/design/my-work/`. Today's jobs, this week and the next job
 * in one card: a week strip that changes the list, a first row that carries
 * its decision, and plain rows under it.
 *
 * ⚠️ NO NEW ENDPOINT. Jobs come through `useHomeTasks()` (the phone's rows
 * with unsent changes on top — never `tasksApi.list()`), shift bars from the
 * member's OWN weekly schedule, and the verb goes through the same outbox
 * action as the task screen, `changeTaskStatus`.
 *
 * ⚠️ A WELL, NOT GLASS. This is a list, and a list over a gradient is what
 * dies in sunlight.
 */
export function MyWorkCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const {
    user,
    amazen,
    t,
    clock,
    router,
    shift,
    c,
    updatedAt,
    shape,
    face,
    phase,
    setPhase,
    fetchList,
    selected,
    setSelected,
    schedule,
    today,
    week,
    tasks,
    open,
    dots,
    mine,
    theirs,
    setFocusId,
    active,
    stepLabel,
    openTask,
  } = useMyWorkCard({ style });

  if (shape === 'none') return null;

  const todayShift = sameDay(selected, today) && shift.status?.isClockedIn ? shift.status.currentEntry : null;
  const selShift = shiftOn(schedule, selected);
  /* ⚠️ What the card SHOWS, carried-over work included — not only the jobs dated that day. */
  const pillCount = shape === 'shifts' ? schedule.filter((e) => e.isActive).length : mine.length + theirs.length;

  return (
    <View style={style}>
      <CardSurface style={{ padding: amazen.space(4.5), gap: amazen.space(3) }}>
        {/* The header. The pill goes to the whole list; the card itself is not a target. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
          <AText variant="h3" tone="strong" style={{ flex: 1 }}>{t('widgets.myWork', { defaultValue: 'My work' })}</AText>
          <FreshnessLabel at={updatedAt} />
          {phase === 'ready' || shape === 'shifts' ? (
            <Pressable
              onPress={() => router.push((shape === 'shifts' ? '/(app)/(tabs)/attendance' : '/(app)/(tabs)/tasks') as Href)}
              accessibilityRole="button"
              hitSlop={8}
              style={{ paddingHorizontal: amazen.space(3), paddingVertical: amazen.space(1.5), borderRadius: amazen.radius.full, backgroundColor: c.tile }}
            >
              <AText variant="caption" tone="strong">{t('myWork.all', { count: pillCount, defaultValue: `All ${pillCount}` })} ›</AText>
            </Pressable>
          ) : null}
        </View>

        {/* The strip. An empty week is information — it renders regardless. */}
        <View style={{ flexDirection: 'row', gap: 5 }}>
          {week.map((d, i) => {
            const on = sameDay(d, selected);
            const flat = phase === 'absent';
            const bar = !flat && shape !== 'tasks' && !!shiftOn(schedule, d);
            const n = flat ? 0 : Math.min(3, dots[i] ?? 0);
            return (
              <Pressable
                key={d.toISOString()}
                onPress={() => setSelected(startOfDay(d))}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={weekdayName(d, 'long')}
                style={{
                  flex: 1, height: 54, borderRadius: amazen.radius.full,
                  alignItems: 'center', justifyContent: 'center', gap: 4,
                  /* Every day is a capsule with a hairline ring; the day shown is jade. */
                  backgroundColor: on ? c.accentTint : 'transparent',
                  borderWidth: on ? 1.5 : 1, borderColor: on ? c.accent : c.lineGlass,
                }}
              >
                <AText variant="caption" tone={on ? 'strong' : 'muted'}>{weekdayName(d, 'narrow')}</AText>
                <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: bar ? (on ? c.accent : c.inkMuted) : 'transparent' }} />
                <View style={{ flexDirection: 'row', gap: 2, height: 4 }}>
                  {Array.from({ length: n }).map((_, k) => (
                    <View key={k} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: on ? c.accent : c.ink }} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>

        {phase === 'refused' && shape !== 'shifts' ? (
          <Sentence tone="critical" title={t('myWork.refused', { defaultValue: 'Could not load your jobs.' })} body={t('myWork.refusedBody', { defaultValue: 'The office refused the request.' })}>
            <Pressable onPress={() => { setPhase('opening'); void fetchList(); }} accessibilityRole="button" style={{ alignSelf: 'flex-start', marginTop: amazen.space(2), paddingHorizontal: amazen.space(3), paddingVertical: amazen.space(1.5), borderRadius: amazen.radius.full, backgroundColor: c.tile }}>
              <AText variant="caption" tone="strong">{t('common.retry', { defaultValue: 'Retry' })}</AText>
            </Pressable>
          </Sentence>
        ) : phase === 'absent' && shape !== 'shifts' ? (
          /* ⚠️ ⑦ — the opposite of "Nothing scheduled". Nothing answered, and this phone never held a copy. */
          <Sentence tone="warn" title={t('myWork.absent', { defaultValue: 'Your jobs are not on this phone yet.' })} body={t('myWork.absentBody', { defaultValue: 'Connect once and they will be here next time, signal or not.' })} />
        ) : (
          <>
            <Eyebrow tone="accent">
              {dayEyebrow(selected, today, t)}
              {/* ⚠️ The rows the list SHOWS — carried-over work included — not only the jobs dated that day: "1 job" over four rows read as a miscount. */}
              {shape === 'tasks' && pillCount > 0 ? ` · ${t('myWork.jobs', { count: pillCount, defaultValue: `${pillCount} jobs` })}` : ''}
              {shape === 'both' && selShift ? ` · ${shiftHours(selShift)}h` : ''}
              {shape === 'both' && todayShift?.location?.name ? ` · ${todayShift.location.name}` : ''}
            </Eyebrow>

            {shape === 'shifts' ? (
              <ShiftList schedule={schedule} selected={selected} today={today} live={todayShift} onOpen={() => router.push('/(app)/(tabs)/attendance' as Href)} />
            ) : phase === 'opening' ? (
              <View style={{ gap: amazen.space(2.5), paddingVertical: amazen.space(1) }}>
                {[88, 64, 76].map((w) => <View key={w} style={{ width: `${w}%`, height: 12, borderRadius: 6, backgroundColor: c.tile }} />)}
              </View>
            ) : (
              <>
                {face !== 'executor' ? <Eyebrow tone="muted">{t('myWork.mine', { count: mine.length, defaultValue: `Mine · ${mine.length}` })}</Eyebrow> : null}
                {mine.length === 0 && (face === 'executor' || theirs.length === 0) ? (
                  <Sentence
                    title={sameDay(selected, today)
                      ? t('myWork.nothingToday', { defaultValue: 'Nothing scheduled today.' })
                      : t('myWork.nothingOn', { day: weekdayName(selected, 'long'), defaultValue: `Nothing scheduled on ${weekdayName(selected, 'long')}.` })}
                    body={nextJobLine(nextJobAfter(face === 'executor' ? tasks : tasks.filter((x) => isMine(x, user?.id)), selected, open), t, clock)}
                  />
                ) : null}
                {mine.map((task, i) => (
                  <React.Fragment key={task.id}>
                    {i > 0 && task !== active && mine[i - 1] !== active ? <WellDivider /> : null}
                    {task === active ? (
                      <ActiveRow
                        key={`active:${task.id}`}
                        task={task}
                        label={stepLabel(task)}
                        clock={clock}
                        onOpen={() => openTask(task)}
                      />
                    ) : (
                      /*
                        ⚠️ EVERY ROW IN THIS LIST IS THE READER'S. It passed
                        `face !== 'executor'`, so an executor's own jobs were
                        drawn as somebody else's: a hollow ring and their OWN
                        first name in front of every title ("Karim · …").
                      */
                      <PlainRow
                        task={task} done={!open(task)} mine clock={clock}
                        /* Yours and still open: focus it here. Anything else opens the job. */
                        onPress={() => (isMine(task, user?.id) && open(task) ? setFocusId(task.id) : openTask(task))}
                      />
                    )}
                  </React.Fragment>
                ))}

                {face === 'spaceSupervisor' && theirs.length > 0 ? (
                  <>
                    <Eyebrow tone="muted" style={{ marginTop: amazen.space(2) }}>{siteLabel(theirs, t)}</Eyebrow>
                    {theirs.slice(0, 3).map((task) => <PlainRow key={task.id} task={task} done={!open(task)} mine={false} clock={clock} onPress={() => openTask(task)} />)}
                    {theirs.length > 3 ? (
                      <Pressable onPress={() => router.push('/(app)/(tabs)/tasks' as Href)} accessibilityRole="button" hitSlop={6}>
                        <AText variant="caption" tone="accent">{t('myWork.more', { count: theirs.length - 3, defaultValue: `+${theirs.length - 3} more` })}</AText>
                      </Pressable>
                    ) : null}
                  </>
                ) : null}

                {face === 'orgWide' && theirs.length > 0 ? <Figures others={theirs} open={open} onPress={() => router.push('/(app)/(tabs)/tasks' as Href)} /> : null}
              </>
            )}
          </>
        )}
      </CardSurface>

    </View>
  );
}
