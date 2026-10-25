import { formatDuration } from '@hbcfield/shared/client';
import { Pressable, View, type ViewStyle } from 'react-native';
import { type Href } from 'expo-router';
import { refusedSpaceId } from '@/offline/attendance/refused-shift';
import { SyncChip } from '@/offline/components/sync-chip';
import { AText, CardSurface, Chip, DiscRow, Eyebrow, LiveDot } from '@/components/amazen';
import { shiftDiscs } from './shift-clock/shift-discs';
import { ShiftHero } from './shift-clock/shift-hero';
import { ShiftProgress } from './shift-clock/shift-progress';
import { RefusedShiftBanner } from './shift-clock/refused-banner';
import type { ShiftClockCardViewState } from './use-shift-clock-card-view';
import type { ShiftClockCardViewView } from './shift-clock-card-view-view';
import type { ShiftClockCardView } from './shift-clock-card';

/** Part of ShiftClockCardView's markup, moved here unchanged; it reads the page's state from `vm`. */
export function ShiftClockCardViewQueued({
  vm,
  style,
  linkToTime,
  eyebrow,
  caption,
  dotColor,
  live,
  eyebrowTone,
  resting,
  noShiftLine,
  weekSoFar,
  working,
  onSetRealTime,
  shift,
}: {
  vm: ShiftClockCardViewState;
  style: Parameters<typeof ShiftClockCardView>[0]['style'];
  linkToTime: NonNullable<Parameters<typeof ShiftClockCardView>[0]['linkToTime']>;
  eyebrow: ReturnType<typeof ShiftClockCardViewView>['eyebrow'];
  caption: ReturnType<typeof ShiftClockCardViewView>['caption'];
  dotColor: ReturnType<typeof ShiftClockCardViewView>['dotColor'];
  live: ReturnType<typeof ShiftClockCardViewView>['live'];
  eyebrowTone: ReturnType<typeof ShiftClockCardViewView>['eyebrowTone'];
  resting: ReturnType<typeof ShiftClockCardViewView>['resting'];
  noShiftLine: ReturnType<typeof ShiftClockCardViewView>['noShiftLine'];
  weekSoFar: ReturnType<typeof ShiftClockCardViewView>['weekSoFar'];
  working: ReturnType<typeof ShiftClockCardViewView>['working'];
  onSetRealTime: Parameters<typeof ShiftClockCardView>[0]['onSetRealTime'];
  shift: Parameters<typeof ShiftClockCardView>[0]['shift'];
}) {
  const {
    amazen,
    router,
    st,
    t,
    entryId,
    clockOf,
    c,
    now,
    refused,
    refusedCopy,
    setReportPrefill,
    setReportOpen,
    engine,
    unread,
    startRest,
    endRest,
    setClockOutAt,
    setBreakOpen,
    setListOpen,
    clockIn,
    status,
    totals,
  } = vm;
  if ((shift.source === 'pending')) return null;
  if ((!status?.isClockedIn && !totals.ready)) return null;
  return (
    <CardSurface fallback="glass" style={[{ padding: amazen.layout.gutter }, style as ViewStyle]}>
      {/* ⚠️ ONLY THE HERO AND CAPTION NAVIGATE — never the whole card. */}
      <Pressable
        onPress={linkToTime ? () => router.push('/(app)/(tabs)/attendance' as Href) : undefined}
        disabled={!linkToTime}
        accessibilityRole={linkToTime ? 'button' : 'summary'}
        accessibilityLabel={`${eyebrow}. ${caption}`}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(1) }}>
          {/* ⚠️ The dot breathes ONLY while somebody is working. A pulse that
              never stops is decoration. */}
          <LiveDot color={dotColor} live={live} />
          <Eyebrow tone={eyebrowTone}>{eyebrow}</Eyebrow>
          <View style={{ flex: 1 }} />
          {/*
            ⑤ QUEUED — not a state of its own, a chip on ②. The shift is
            identical; the office simply has not heard about it yet, and the
            card SAYS so rather than pretending it has.
          */}
          {st.queued ? <Chip label={t('shiftClock.queued', { defaultValue: 'QUEUED' })} tone="warn" /> : null}
          <SyncChip entityId={entryId} />
        </View>

        <View style={{ marginTop: amazen.space(3) }}><ShiftHero st={st} resting={resting} clockOf={clockOf} /></View>

        {caption ? (
          /* ⚠️ `onGlass` is measured over the ground's lighter top stop —
             lighter, and `#9fbdb4` measures 4.14:1 there. This caption is the
             one §8 names as at risk. */
          <AText variant="caption" tone="onGlass" numberOfLines={2} style={{ marginTop: 2 }}>
            {caption}
          </AText>
        ) : null}

        {noShiftLine ? (
          <AText variant="caption" tone="onGlass" numberOfLines={2} style={{ marginTop: amazen.space(2) }}>
            {noShiftLine}
          </AText>
        ) : null}

        {/* ④ The strip — and the reason the primary action moves. */}
        {st.kind === 'restOverdue' ? (
          <View
            style={{
              marginTop: amazen.space(3),
              backgroundColor: c.warnTint,
              borderRadius: amazen.radius.field,
              paddingVertical: amazen.space(2),
              paddingHorizontal: amazen.space(3),
            }}
          >
            <AText variant="caption" tone="warn">
              {t('shiftClock.restOverdueDuration', {
                duration: formatDuration(st.restOverdueBy),
                defaultValue: `Your rest was due ${formatDuration(st.restOverdueBy)} ago`,
              })}
            </AText>
          </View>
        ) : null}

        <ShiftProgress st={st} live={live} resting={resting} now={now} weekSoFar={weekSoFar} />
      </Pressable>

      {refused && refusedCopy ? (
        <RefusedShiftBanner
          copy={refusedCopy}
          onTellOffice={() => {
            setReportPrefill({ title: refusedCopy.issueTitle, body: refusedCopy.issueBody, spaceId: refusedSpaceId(refused) });
            setReportOpen(true);
          }}
          onDismiss={() => void engine?.discard(refused.id)}
        />
      ) : null}

      {/*
        ⚠️ EXACTLY ONE DISC IS FILLED (rule 2), and its GLOW is what marks it
        primary — not its size and not its position. That is what lets the
        primary MOVE (④ offers *Start the rest*) without the row re-flowing.

        ⚠️ EVERY DISC CARRIES A LABEL (rule 3). Icons never carry meaning
        alone, least of all on a card used in gloves in the dark.

        ⚠️ AND CLOCKED OUT IS A PILL, NOT A ROW OF ONE. A single filled disc
        beside two quiet ones makes the act of starting the day look like a
        choice among three; the shift has not begun, so there is exactly one
        thing to do and the card should say so at full width. Once the clock
        is running there are four real jobs and the row is right.
      */}
      {live || resting || st.kind === 'unconfirmed' ? (
        <DiscRow style={{ marginTop: amazen.space(5) }}>
          {shiftDiscs({
            st, t, live, resting, working, entryId, unread, router, onSetRealTime,
            startRest, endRest, setClockOutAt, setBreakOpen, setReportOpen, setListOpen,
          })}
        </DiscRow>
      ) : (
        <Pressable
          onPress={clockIn.openClockInModal}
          disabled={working}
          accessibilityRole="button"
          style={({ pressed }) => ({
            marginTop: amazen.space(5),
            paddingVertical: amazen.space(3.5),
            alignItems: 'center',
            borderRadius: amazen.radius.full,
            backgroundColor: c.accentSolid,
            opacity: working ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          <AText variant="body" style={{ color: c.accentInk, fontFamily: amazen.font.sansMedium }}>
            {refusedCopy?.canClockInNow
              ? t('shiftClock.refused.clockInNow', { defaultValue: 'Clock in now' })
              : st.kind === 'done'
                ? t('shiftClock.clockInAgain', { defaultValue: 'Clock in again' })
                : t('home.fullTime.clockIn')}
          </AText>
        </Pressable>
      )}
    </CardSurface>
  );
}
