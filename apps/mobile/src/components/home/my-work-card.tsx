import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View, StyleSheet, Linking } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { hasModule } from '@hbcfield/shared/client';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useHomeTasks } from '../../offline/tasks/use-home-tasks';
import { FreshnessLabel } from '../../offline/components/freshness-label';
import { useShift } from '../../offline/attendance/use-shift';
import type { Task } from '../../lib/api/types';
import { AText, Chip, Eyebrow, Well, WellDivider, Disc, WidgetHeader } from '../amazen';
import { NavigateGlyph, MoreGlyph } from '../glyphs/work-glyphs';
import type { GlyphProps } from '../glyphs/glyphs';
import {
  shapeFor, faceFor, weekOf, tasksOn, dotsForWeek, startOfDay, decisionFor,
} from './my-work';

/**
 * My work — §3.2 *Today's jobs*, §3.5 *This week* and §3.3 *My next job*, in
 * one row of the registry.
 *
 * ⚠️ ⑤ FOLDED IN BECAUSE OF THE INTERACTION, not the tidiness. Half the merge
 * already happened in the data — the strip and the list always drew from one
 * pool of dates — and what the merge ADDS is the thing two separate cards
 * structurally cannot do: **tapping a day changes the list underneath it.** If
 * that ever becomes a read-only ribbon that navigates out to `/tasks`, unfold
 * it: it then buys about 60px and costs a registry row.
 *
 * ⚠️ ③ FOLDED IN BECAUSE THE ALTERNATIVE WAS WORSE. Keeping `next-job` as its
 * own card means the first row of the list is the same job shown twice, and
 * the fix for that — the list dropping its first row when `next-job` is
 * present — makes two registry rows know about each other. Folding the
 * decision into the first row removes the problem instead of managing it.
 *
 * ⚠️ A WELL, NOT GLASS. This is a list, and a list over a gradient is what
 * dies in sunlight.
 */
export function MyWorkCard({ style }: { style?: object }) {
  const { user } = useAuth();
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { tasks, updatedAt, load } = useHomeTasks();
  const shift = useShift();
  const c = amazen.color;

  useEffect(() => { void load().catch(() => undefined); }, [load]);

  // Today is selected on mount, always. Selecting a day is a READ — §4 forbids
  // writing on render and this does not.
  const [selected, setSelected] = useState<Date>(() => startOfDay(new Date()));
  const week = useMemo(() => weekOf(new Date()), []);

  const shape = shapeFor({
    tasks: hasModule(user ?? {}, 'tasks'),
    clock: hasModule(user ?? {}, 'clock'),
  });

  const face = useMemo(
    () =>
      faceFor({
        role: user?.role ?? null,
        canViewAllTasks: user?.canViewAllTasks,
        viewAllSpaceIds: user?.access?.perSpace
          ? Object.entries(user.access.perSpace)
              .filter(([, g]) => (g as Record<string, boolean>)?.canViewAllTasks)
              .map(([id]) => id)
          : [],
      }),
    [user?.role, user?.canViewAllTasks, user?.access?.perSpace],
  );

  /*
    ⚠️ MEMOISED, because `dotsForWeek` is SEVEN passes over the task list.

    It calls `tasksOn` once per day, and each of those filters and sorts every
    task the member can see. Unmemoised that ran on every render of this card —
    every day tap, every queue movement, every parent update — and this member
    has 157 tasks. Seven filters and seven sorts of 157 rows to redraw four
    dots is the kind of cost that does not show up until somebody has a real
    book of work.
  */
  const dayTasks = useMemo(
    () => (shape === 'shifts' ? [] : tasksOn(tasks, selected)),
    [shape, tasks, selected],
  );
  const dots = useMemo(
    () => (shape === 'shifts' ? week.map(() => 0) : dotsForWeek(tasks, week)),
    [shape, tasks, week],
  );

  /*
    MINE ALWAYS LEADS. Every face that shows other people's work shows the
    reader's first, grouped and labelled. The widget is about YOUR work; the
    reader is the subject of that sentence whatever else is on screen.
  */
  const { mine, theirs, ordered } = useMemo(() => {
    const m = dayTasks.filter((x) => x.assignedToId === user?.id);
    const th = dayTasks.filter((x) => x.assignedToId !== user?.id);
    return { mine: m, theirs: th, ordered: face === 'executor' ? dayTasks : [...m, ...th] };
  }, [dayTasks, user?.id, face]);

  const first = ordered[0];
  const decision = useMemo(
    () => (first ? decisionFor(first, user?.id) : null),
    [first, user?.id],
  );
  const rest = ordered.slice(first ? 1 : 0);

  /*
    ⚠️ THE EARLY EXIT LIVES HERE, BELOW EVERY HOOK, and it used to live above
    them. Holding neither module means the widget does not render at all — but
    a `return null` before a `useMemo` changes how many hooks run between one
    render and the next, which is the one thing React cannot recover from. The
    day somebody's modules change while the screen is open, the component
    would have thrown rather than disappeared.
  */
  if (shape === 'none') return null;

  return (
    <View style={style}>
      <WidgetHeader
        title={t('widgets.myWork', { defaultValue: 'My work' })}
        action={t('common.seeAll', { defaultValue: 'All' })}
        onPress={() => router.push('/(app)/(tabs)/tasks' as Href)}
      />
      <Well style={{ padding: amazen.space(5) }}>
        {/*
          ⚠️ How old this list is, when it came from the phone rather than the
          server. Without it an old list is indistinguishable from a fresh one,
          which is worse than showing nothing — somebody plans a day around
          jobs that were reassigned this morning. Renders nothing when the
          server answered.
        */}
        <FreshnessLabel at={updatedAt} />

        {/*
          The strip. ⚠️ AN EMPTY WEEK IS INFORMATION — it renders regardless,
          and every day stays tappable even with nothing on it.
        */}
        <View style={{ flexDirection: 'row', gap: amazen.space(1.5) }}>
          {week.map((d, i) => {
            const isSelected = startOfDay(d).getTime() === selected.getTime();
            const count = dots[i] ?? 0;
            const hasShift = shape !== 'tasks' && d.getDay() !== 0 && d.getDay() !== 6;
            return (
              <Pressable
                key={d.toISOString()}
                onPress={() => setSelected(startOfDay(d))}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={d.toLocaleDateString(undefined, { weekday: 'long' })}
                style={{
                  flex: 1,
                  height: 54,
                  borderRadius: amazen.radius.full,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  backgroundColor: isSelected ? c.accentTint : c.tile,
                  borderWidth: isSelected ? 1.5 : 0,
                  borderColor: isSelected ? c.accent : 'transparent',
                }}
              >
                <AText variant="caption" tone={isSelected ? 'accent' : 'muted'}>
                  {d.toLocaleDateString(undefined, { weekday: 'narrow' })}
                </AText>
                {/* A bar is a shift. */}
                {hasShift ? (
                  <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: isSelected ? c.accent : c.inkMuted }} />
                ) : null}
                {/* Dots are jobs, three at most — past three the count stops
                    changing what somebody does with the day. */}
                <View style={{ flexDirection: 'row', gap: 2, height: 4 }}>
                  {Array.from({ length: Math.min(3, count) }).map((_, k) => (
                    <View key={k} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: isSelected ? c.accent : c.inkMuted }} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* The day, named — and the shift above the jobs when there is one. */}
        <Eyebrow tone="accent" style={{ marginTop: amazen.space(4) }}>
          {dayLabel(selected, t)}
          {shift.status?.currentEntry?.location?.name ? ` · ${shift.status.currentEntry.location.name}` : ''}
        </Eyebrow>

        {shape === 'shifts' ? (
          <AText variant="body" tone="muted" style={{ marginTop: amazen.space(2) }}>
            {t('myWork.shiftsOnly', { defaultValue: 'Your shifts for the week are above.' })}
          </AText>
        ) : ordered.length === 0 ? (
          /*
            ⚠️ This must be TRUE, not the result of a failed fetch. That
            distinction is the whole reason `list-failure.ts` exists: a widget
            that says "nothing scheduled" when the network died is lying to
            somebody about their day.
          */
          <AText variant="body" tone="muted" style={{ marginTop: amazen.space(2) }}>
            {t('myWork.nothingScheduled', { defaultValue: 'Nothing scheduled.' })}
          </AText>
        ) : (
          <>
            {first ? (
              <ActiveRow
                task={first}
                decision={decision}
                onOpen={() => router.push(`/task/${first.id}` as Href)}
              />
            ) : null}
            {rest.map((task, i) => (
              <React.Fragment key={task.id}>
                {i === 0 ? <View style={{ height: amazen.space(2) }} /> : <WellDivider />}
                <PlainRow task={task} onPress={() => router.push(`/task/${task.id}` as Href)} />
              </React.Fragment>
            ))}
            {/* The one face whose answer is a figure rather than a list. */}
            {face === 'orgWide' && theirs.length > 0 ? (
              <View style={{ marginTop: amazen.space(3), flexDirection: 'row', gap: amazen.space(2) }}>
                <Chip label={t('myWork.mineCount', { count: mine.length, defaultValue: `${mine.length} mine` })} tone="accent" numeric />
                <Chip label={t('myWork.orgCount', { count: theirs.length, defaultValue: `${theirs.length} others` })} numeric />
              </View>
            ) : null}
          </>
        )}
      </Well>
    </View>
  );
}

/**
 * The first job of the selected day, WHEN IT IS THE READER'S OWN — raised one
 * step out of the well and carrying its decision. Everything below stays a
 * plain row; there is no second card.
 */
function ActiveRow({
  task, decision, onOpen,
}: {
  task: Task;
  decision: ReturnType<typeof decisionFor>;
  onOpen: () => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;

  /*
    ⚠️ COORDINATES ARE COERCED AND CHECKED BEFORE THEY GO INTO A URL.

    They are typed `number | undefined`, but they arrive as JSON from the
    server and TypeScript stops at the boundary — a string there would be
    interpolated straight into a `geo:` URL handed to the OS. `Number()` plus
    `isFinite` is two lines and closes it. Zero is a legal coordinate, so this
    cannot be a truthiness check.
  */
  const lat = Number(task.locationLat);
  const lng = Number(task.locationLng);
  const canNavigate = Number.isFinite(lat) && Number.isFinite(lng);

  /*
    ⚠️ NO CALL DISC, BECAUSE THERE IS NO NUMBER.

    §4 of the spec ranks Call first before a job is accepted — "the useful act
    is often a question" — and it is right. But `Task` carries no phone field
    and neither does its assignee, so the disc was wired to a `const phone =
    null` and did NOTHING when pressed. A control that is drawn, labelled,
    reachable and inert is worse than an absent one: it is tapped, in a van, by
    somebody who then believes the call is ringing.

    So the row offers what it can actually do. When a contact number reaches
    the task, the disc comes back — and the same rule the rest of this app
    keeps applies: nothing is visible-then-refused.
  */
  const primaryDisc: { Glyph: React.ComponentType<GlyphProps>; label: string; onPress: () => void } | null =
    task.status === 'EN_ROUTE' && canNavigate
      ? {
          Glyph: NavigateGlyph,
          label: t('taskDetail.navigate', { defaultValue: 'Navigate' }),
          onPress: () => { void Linking.openURL(`geo:${lat},${lng}`); },
        }
      : null;

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={task.title}
      style={{
        marginTop: amazen.space(3),
        backgroundColor: c.tile,
        borderRadius: 20,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: c.lineWell,
        padding: amazen.space(4),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(1.5) }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent }} />
        <Eyebrow tone="muted">{task.status.replace(/_/g, ' ')}</Eyebrow>
      </View>
      <AText variant="h3" tone="strong" numberOfLines={2} style={{ marginTop: amazen.space(1) }}>
        {task.title}
      </AText>
      <AText variant="caption" tone="muted" numberOfLines={1} style={{ marginTop: 2 }}>
        {[
          task.dueDate ? new Date(task.dueDate).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : null,
          task.locationAddress,
          task.assignedTo ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}`.trim() : null,
        ].filter(Boolean).join(' · ')}
      </AText>

      {/*
        ⚠️ NO VERB WHEN THE JOB IS NOT YOURS. A shared-space supervisor sees
        rows and no button — none of these are theirs to act on, and access
        decides whether there is a decision at all.
      */}
      {decision ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), marginTop: amazen.space(3) }}>
          <Pressable
            onPress={onOpen}
            accessibilityRole="button"
            /* The label is organization-authored — `FlowStatus.label`, never
               one of five hardcoded verbs. */
            accessibilityLabel={decision.primary.label}
            style={{
              flex: 1,
              backgroundColor: c.accentTint,
              borderRadius: amazen.radius.full,
              paddingVertical: amazen.space(2.5),
              alignItems: 'center',
              minHeight: amazen.layout.tapMin,
              justifyContent: 'center',
            }}
          >
            <AText variant="h3" tone="accent">{decision.primary.label}</AText>
          </Pressable>
          {primaryDisc ? <Disc {...primaryDisc} behind={c.tile} /> : null}
          {/* ⚠️ Everything else goes behind the `⋯` — two equal buttons is how
              somebody declines a job by accident. */}
          {decision.rest.length > 0 ? (
            <Disc Glyph={MoreGlyph} label={t('common.more', { defaultValue: 'More' })} behind={c.tile} onPress={onOpen} />
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function PlainRow({ task, onPress }: { task: Task; onPress: () => void }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={task.title}
      style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2.5), paddingVertical: amazen.space(3) }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.inkMuted }} />
      <AText variant="body" tone="strong" numberOfLines={1} style={{ flex: 1 }}>{task.title}</AText>
      <AText variant="caption" tone="muted" numeric>
        {task.dueDate ? new Date(task.dueDate).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : ''}
      </AText>
    </Pressable>
  );
}

function dayLabel(d: Date, t: (k: string, o: { defaultValue: string }) => string): string {
  const today = startOfDay(new Date()).getTime();
  const day = startOfDay(d).getTime();
  if (day === today) return t('common.today', { defaultValue: 'TODAY' });
  if (day === today + 86_400_000) return t('common.tomorrow', { defaultValue: 'TOMORROW' });
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}

/*
  The flow's own marks — `AcceptGlyph`, `OnMyWayGlyph`, `ArrivedGlyph`,
  `StartWorkGlyph`, `FinishGlyph` — are NOT imported here on purpose.

  ⚠️ Marks map to the TRANSITION, never to the wording: the verb is
  organization-authored and a mark chosen from the label would be wrong the
  first time somebody renames "Accept" to "Take it". They belong on the `⋯`
  sheet, beside the transition keys, and that is where they are read.
*/
