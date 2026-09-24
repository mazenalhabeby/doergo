import React from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { GlassCard, AText, Eyebrow, LiveDot, WellDivider } from '../amazen';
import { initialsOf } from '../../lib/people';
import { Avatar } from '../team/avatar';
import { NotArrivedGlyph, HoursWaitingGlyph } from '../glyphs/crew-glyphs';
import { CallGlyph } from '../glyphs/work-glyphs';
import {
  crewState, exceptionNames, BAND_ORDER, CAPS,
  type Band, type CrewPerson, type CrewTile, type Ring,
} from './crew-state';

/**
 * Who is on, who is late, what is waiting — §3.6, §3.7 and §3.8 in one row.
 *
 * ⚠️ THE CARD'S HEIGHT TRACKS HOW MUCH IS HAPPENING, NOT HOW MANY PEOPLE THERE
 * ARE. Two hundred people on a calm morning is a SHORTER card than nine people
 * with three problems. If calm and broken look the same, the central idea did
 * not land — which is the failure of every manager dashboard that keeps its
 * alarm furniture on screen permanently, greyed out.
 *
 * ⚠️ GLASS, like the shift clock — the third and last glass card in the
 * catalogue. Everything else in the set is a well, because a list over a
 * gradient is what dies in sunlight.
 *
 * ⚠️ ONE VERB ON THE CARD: Call, on a late tile, and it needs no permission —
 * you are dialling a phone. Everything that changes a record (excusing a
 * no-show, approving overtime) lives behind the exception rows in
 * `/manage/attendance`, where its own permission is checked. This card was only
 * ever a doorway; a version with Excuse and Approve on it would carry two more
 * permission checks and two more confirm flows for actions better done next to
 * the evidence.
 *
 * The decisions live in `crew-state.ts`. This file draws them.
 */

const RAIL_TILE = 104;

export function CrewCard({ style }: { style?: object }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const c = amazen.color;

  /*
    ⚠️ PRESENCE IS NOT KEPT. §3.6 — a now question; stale is wrong, not old.
    Until the bounded endpoint from `FINDINGS.md` §2 lands, this renders the
    offline state rather than pulling ~148 rows on every home render to draw
    one number. `SCALE.md`: bound the endpoint first, or the rule only makes
    the DRAWING cheap while the FETCH still scales with the customer.
  */
  const s = crewState({ people: [], rosteredCount: 0, spaceIds: [], failed: true });

  const open = () => router.push('/(app)/manage/attendance' as Href);

  return (
    <GlassCard style={style}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
        <Eyebrow tone="onGlass">{t('widgets.crew', { defaultValue: 'Crew' })}</Eyebrow>
        <View style={{ flex: 1 }} />
        {s.kind !== 'offline' ? <LiveDot color={c.accent} live /> : null}
      </View>

      {/*
        ⚠️ THE `/n` IS DROPPED WHEN THERE IS NO ROSTER IN SCOPE.

        The shipped code made `rostered` the set of people already clocked in
        when no roster was visible, so "6 of 9" became "6 of 6": the bar full
        forever, nobody ever missing, for every supervisor granted attendance
        but not sites. A number with no denominator is honest; a denominator
        that is a copy of the numerator is not.
      */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: amazen.space(3) }}>
        <AText variant="display" tone={s.kind === 'offline' ? 'muted' : 'strong'}>
          {s.kind === 'offline' ? '—' : s.rostered == null ? String(s.on) : `${s.on}/${s.rostered}`}
        </AText>
      </View>
      <AText variant="caption" tone="onGlass" style={{ marginTop: 6 }}>
        {s.kind === 'offline'
          ? t('crew.offline', {
              defaultValue: 'Needs a connection. A kept answer would be wrong, not old.',
            })
          : s.rostered == null
            ? t('crew.onTheClockNow', { defaultValue: 'on the clock right now' })
            : t('crew.onTheClock', { defaultValue: 'on the clock' })}
      </AText>

      {s.kind === 'offline' ? (
        /*
          Three empty placeholder shapes, so the card KEEPS ITS HEIGHT and does
          not jump when the answer arrives. ⚠️ And no "last updated" line.
        */
        <View style={{ flexDirection: 'row', gap: 9, marginTop: amazen.space(4) }}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={{
                width: RAIL_TILE, height: 132,
                borderRadius: amazen.radius.tile,
                backgroundColor: c.tile,
              }}
            />
          ))}
        </View>
      ) : null}

      {/*
        ⚠️ THE RAIL SCROLLS SIDEWAYS, NEVER WRAPS. Nine tiles and three tiles
        are the same height — which is the whole point of the card.
      */}
      {s.tiles.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 9, paddingTop: amazen.space(4) }}
        >
          {s.tiles.map((tile) => (
            <CrewTileView key={tile.person.userId} tile={tile} />
          ))}
          {s.steady.length > 0 ? <SteadyChip people={s.steady} /> : null}
          {s.tilesOverflow > 0 ? (
            <View style={{ width: RAIL_TILE, justifyContent: 'center', alignItems: 'center' }}>
              <AText variant="h3" tone="muted">{`+${s.tilesOverflow}`}</AText>
            </View>
          ) : null}
        </ScrollView>
      ) : null}

      {/*
        ⚠️ CALM HAS NO TILES AT ALL. A good morning should LOOK like one, and
        the card getting visibly shorter is how it says so.
      */}
      {s.kind === 'calm' ? (
        <AText variant="body" tone="onGlass" style={{ marginTop: amazen.space(4) }}>
          {t('crew.calm', { defaultValue: 'Everyone is in. Nothing waiting.' })}
        </AText>
      ) : null}

      {s.kind === 'nobody' ? (
        <AText variant="body" tone="onGlass" style={{ marginTop: amazen.space(4) }}>
          {t('crew.empty', { defaultValue: 'Nobody is on shift right now.' })}
        </AText>
      ) : null}

      {/* The exception rows — one per non-empty kind, and the only way in. */}
      {BAND_ORDER.map((band) => {
        const of = s.tiles.filter((x) => x.band === band);
        if (of.length === 0) return null;
        return <ExceptionRow key={band} band={band} tiles={of} onPress={open} />;
      })}
    </GlassCard>
  );
}

/**
 * Six lines, one person.
 *
 * ⚠️ THE FIGURE IS TIME LEFT, NOT TIME WORKED. Every other attendance surface
 * in the app shows hours worked; a manager at 13:20 does not need that — they
 * need to know Pia is free in 25 minutes. That is the manager's question and
 * it is the only reason this tile is different from a roster row.
 */
function CrewTileView({ tile }: { tile: CrewTile }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const p = tile.person;

  const ringColor =
    tile.band === 'late' ? c.critical
    : tile.band === 'breakOver' || tile.band === 'over' ? c.warn
    : c.accent;

  return (
    <View style={{ width: RAIL_TILE, gap: 6 }}>
      <View style={{ alignItems: 'center' }}>
        <RingView ring={tile.ring} color={ringColor} tint={c.tile}>
          {/* ⚠️ Initials on a deterministic low-chroma ground — six grounds
              and one ink is what makes a row of people read as a family rather
              than a chart. Never accent hues: the jade is the ring's job, and
              a disc competing with its own ring loses both. */}
          <Avatar
            id={p.userId}
            initials={initialsOf({ firstName: p.firstName, lastName: p.lastName })}
            imageUrl={p.avatarUrl}
            size={44}
          />
        </RingView>
        {/* ⚠️ The only tile that carries an action, and the only one in crit. */}
        {tile.band === 'late' ? (
          <Pressable
            onPress={() => Linking.openURL('tel:')}
            accessibilityRole="button"
            accessibilityLabel={t('crew.call', { defaultValue: 'Call {{name}}', name: p.firstName })}
            style={{
              position: 'absolute', right: 12, bottom: -2,
              width: 26, height: 26, borderRadius: amazen.radius.full,
              backgroundColor: c.critical, alignItems: 'center', justifyContent: 'center',
            }}
          >
            <CallGlyph size={15} color={c.criticalInk} contrast={c.critical} />
          </Pressable>
        ) : null}
      </View>

      {/* ⚠️ First name only. A row of initials is a puzzle. */}
      <AText variant="caption" tone="strong" numberOfLines={1} style={{ textAlign: 'center' }}>
        {p.firstName}
      </AText>
      {/* The place decides whether you can walk over. */}
      {p.spaceName ? (
        <AText variant="caption" tone="muted" numberOfLines={1} style={{ textAlign: 'center' }}>
          {p.spaceName}
        </AText>
      ) : null}
      <AText
        variant="caption"
        tone={tile.band === 'late' ? 'critical' : tile.band === 'freeSoon' ? 'accent' : 'ink'}
        numberOfLines={2}
        style={{ textAlign: 'center' }}
      >
        {figure(tile, t)}
      </AText>
    </View>
  );
}

function figure(tile: CrewTile, t: (k: string, o: { defaultValue: string; n: number }) => string): string {
  const n = tile.minutes;
  switch (tile.band) {
    case 'late': return t('crew.minLate', { defaultValue: '{{n}} min late', n });
    case 'freeSoon': return t('crew.minLeft', { defaultValue: '{{n}} min left', n });
    case 'over': return t('crew.minOver', { defaultValue: '{{n}} min over', n });
    case 'breakOver': return t('crew.minBreak', { defaultValue: '{{n}} min break', n });
  }
}

/**
 * ⚠️ TWO OF THESE ARE PLAIN ON PURPOSE.
 *
 * `expectedClockOutAt == null` — nothing to be a fraction of. `endIsDailyLimit`
 * — a cut-off is not a finish, and an arc at 90% against a daily cap reads
 * "nearly done" when it means "nearly at the limit". Late gets no arc either:
 * there is no shift underway.
 */
function RingView({
  ring, color, tint, children,
}: { ring: Ring; color: string; tint: string; children: React.ReactNode }) {
  const { amazen } = useTheme();
  const size = 54;
  const border =
    ring.kind === 'none' ? 0
    : ring.kind === 'dashedLate' || ring.kind === 'break' ? 2
    : 2.5;

  return (
    <View
      style={{
        width: size, height: size, borderRadius: amazen.radius.full,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: border,
        borderColor: ring.kind === 'none' ? 'transparent' : color,
        borderStyle: ring.kind === 'dashedLate' || ring.kind === 'break' ? 'dashed' : 'solid',
        opacity: ring.kind === 'none' ? 0.55 : 1,
        backgroundColor: tint,
      }}
    >
      {children}
    </View>
  );
}

/** Everyone with nothing to decide about them, as one chip. */
function SteadyChip({ people }: { people: CrewPerson[] }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  return (
    <View
      style={{
        width: RAIL_TILE, borderRadius: amazen.radius.tile,
        backgroundColor: c.tile, padding: amazen.space(2.5), gap: 5,
      }}
    >
      <View style={{ flexDirection: 'row' }}>
        {people.slice(0, CAPS.steadyFaces).map((p, i) => (
          <View key={p.userId} style={{ marginLeft: i === 0 ? 0 : -8 }}>
            <Avatar
              id={p.userId}
              initials={initialsOf({ firstName: p.firstName, lastName: p.lastName })}
              imageUrl={p.avatarUrl}
              size={24}
            />
          </View>
        ))}
      </View>
      <AText variant="h3" tone="strong">{`+${people.length}`}</AText>
      <AText variant="caption" tone="muted">{t('crew.steady', { defaultValue: 'steady' })}</AText>
      <AText variant="caption" tone="muted" numberOfLines={2}>
        {t('crew.nothingToDecide', { defaultValue: 'Nothing to decide.' })}
      </AText>
    </View>
  );
}

/** One per non-empty kind — and where every verb that changes a record lives. */
function ExceptionRow({
  band, tiles, onPress,
}: { band: Band; tiles: CrewTile[]; onPress: () => void }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const { names, more } = exceptionNames(tiles);
  const Glyph = band === 'late' ? NotArrivedGlyph : HoursWaitingGlyph;
  const tone = band === 'late' ? c.critical : c.warn;

  return (
    <>
      <View style={{ height: amazen.space(3) }} />
      <WellDivider />
      <View style={{ height: amazen.space(3) }} />
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3) }}
      >
        <Glyph size={22} color={tone} contrast={c.well} />
        <View style={{ flex: 1 }}>
          <AText variant="body" tone="strong">
            {band === 'late'
              ? t('crew.notArrived', { defaultValue: '{{n}} not arrived', n: tiles.length })
              : t('crew.waiting', { defaultValue: '{{n}} waiting', n: tiles.length })}
          </AText>
          <AText variant="caption" tone="muted" numberOfLines={1}>
            {[...names, more > 0 ? t('crew.more', { defaultValue: '{{n}} more', n: more }) : null]
              .filter(Boolean)
              .join(' · ')}
          </AText>
        </View>
        <AText variant="body" tone="muted">›</AText>
      </Pressable>
    </>
  );
}
