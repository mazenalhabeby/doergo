import React, { useEffect, useMemo, useState } from 'react';
import Reanimated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { holds } from '../../lib/permissions';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { AText, Eyebrow, Well } from '../amazen';
import { NotArrivedGlyph, HoursWaitingGlyph } from '../glyphs/crew-glyphs';
import Svg, { Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { crewState, type Band, type CrewPerson, type CrewTile, type Ring } from './crew-state';
import { useCrew } from './use-crew';
import { GlyphTile } from './glyph-tile';
import { usePitch } from '../../home/pitch';
import { WellDoor } from './well-door';

/**
 * Crew — `docs/design/crew`. Who is on (§3.6), shifts waiting (§3.7) and
 * no-shows (§3.8) in ONE registry row.
 *
 * ⚠️ A TILE MEANS A DECISION. The card's height tracks how much is happening,
 * not how many people there are: two hundred people on a calm morning is a
 * short card, nine people with three problems a long one. The rules live in
 * `crew-state.ts` (tested); this file draws them.
 *
 * ⚠️ THE UNIT IS DERIVED, NOT CHOSEN. One workspace → people; two or three →
 * people with the site on each tile; four or more → workspaces, sorted by
 * trouble, and a tap brings that site's people back, scoped.
 *
 * ⚠️ NOTHING HERE CHANGES A RECORD. Excusing a no-show and approving a shift
 * live on the attendance screen, behind their own grants; the exception rows
 * are the way in.
 */
export function CrewCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const c = amazen.color;
  const allowed = holds(user, 'canViewSpaceAttendance');
  const data = useCrew(allowed);
  const { formatClock } = useTimeFormat();

  const allSpaces = useMemo(() => [...new Set(data.people.map((p) => p.spaceId).filter((x): x is string => !!x))], [data.people]);
  /*
    ⭐ THE SCOPE: all workspaces, or one. Chosen with the rings under the
    number; the whole card answers for it. It OPENS where the trouble is — the
    one workspace that needs you when there is exactly one, ALL otherwise.
  */
  const needs = useMemo(() => {
    const out: Record<string, number> = {};
    const all = crewState({ people: data.people, rosteredCount: data.people.length, spaceIds: allSpaces, now: data.at });
    for (const tile of all.tiles) {
      if ((tile.band === 'late' || tile.band === 'missed') && tile.person.spaceId) out[tile.person.spaceId] = (out[tile.person.spaceId] ?? 0) + 1;
    }
    return out;
  }, [data.people, allSpaces, data.at]);
  const needTotal = Object.values(needs).reduce((a, b) => a + b, 0);
  usePitch(data.loading || data.failed ? null : needTotal
    ? { need: needTotal, line: t('pitch.crew', { count: needTotal }) }
    : { need: 0, line: t('pitch.crewCalm') });
  const [picked, setPicked] = useState<string | null>(null);
  const troubled = allSpaces.filter((id) => (needs[id] ?? 0) > 0 || (data.pendingBySpace[id] ?? 0) > 0);
  const site = picked === 'ALL' ? null : picked && allSpaces.includes(picked) ? picked : picked === null && troubled.length === 1 ? troubled[0]! : null;
  const scoped = site ? data.people.filter((p) => p.spaceId === site) : data.people;
  const s = useMemo(() => crewState({
    people: scoped,
    rosteredCount: scoped.length,
    spaceIds: site ? [site] : allSpaces,
    failed: data.failed,
    now: data.at,
  }), [scoped, site, allSpaces, data.failed, data.at]);

  const openAttendance = () => router.push('/(app)/manage/attendance' as Href);

  /* ⚠️ Below every hook: somebody without the grant never sees the card at all. */
  if (!allowed) return null;

  const siteName = site ? data.people.find((p) => p.spaceId === site)?.spaceName ?? '' : '';
  const sub = data.failed
    ? t('crew.notKept', { defaultValue: 'Presence is not kept' })
    : site ? siteName
    : s.unit === 'workspaces'
      ? t('crew.workspacesShort', { count: allSpaces.length, short: s.sites.filter((x) => !!x.trouble).length, defaultValue: `${allSpaces.length} workspaces · ${s.sites.filter((x) => !!x.trouble).length} short` })
      : s.unit === 'peopleWithSite'
        ? allSpaces.map((id) => data.people.find((p) => p.spaceId === id)?.spaceName).filter(Boolean).join(' · ')
        : `${data.people[0]?.spaceName ?? ''} · ${t('crew.oneWorkspace', { defaultValue: 'one workspace' })}`;


  return (
    <View style={style}>
      <Well style={{ padding: amazen.space(4.5), gap: amazen.space(3) }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
          <Eyebrow tone="muted" style={{ flex: 1 }}>{t('widgets.crew', { defaultValue: 'Crew' })}</Eyebrow>
          {!data.failed ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent }} />
              <AText variant="caption" tone="accent" numeric>{formatClock(new Date(data.at))}</AText>
            </View>
          ) : null}
        </View>

        {/* The hero. ⚠️ The "/n" is dropped when there is no roster — never a copy of the numerator. */}
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <ScopeFade k={site ?? 'ALL'} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <AText variant="display" tone={data.failed ? 'muted' : 'strong'} numeric style={{ fontSize: 56, lineHeight: 60 }}>
                {data.failed ? '—' : String(s.on)}
              </AText>
              {!data.failed && s.rostered != null ? <AText variant="h2" tone="muted" numeric style={{ fontWeight: '300' }}>/{s.rostered}</AText> : null}
            </ScopeFade>
            <AText variant="body" tone="muted">{t('crew.onTheClock', { defaultValue: 'on the clock' })}</AText>
          </View>
          {allSpaces.length > 1 && !data.failed ? (
            <ScopeRings
              spaces={allSpaces.map((id) => ({ id, name: data.people.find((p) => p.spaceId === id)?.spaceName ?? '' }))}
              people={data.people}
              needs={needs}
              pending={data.pendingBySpace}
              current={site}
              now={data.at}
              onPick={(id) => setPicked(id ?? 'ALL')}
            />
          ) : sub ? <Eyebrow tone="muted" numberOfLines={1}>{sub}</Eyebrow> : null}
        </View>

        {data.loading && !data.people.length && !data.failed ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>{[0, 1, 2].map((i) => <View key={i} style={{ width: 118, height: 150, borderRadius: 20, backgroundColor: c.tile }} />)}</View>
        ) : data.failed ? (
          <>
            {/* ⚠️ Three empty shapes so the card keeps its height — and no "last updated" line. */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ width: 104, height: 110, borderRadius: 20, backgroundColor: c.tile, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: c.lineGlass }} />
                </View>
              ))}
            </View>
            <Message dim text={t('crew.offline', { defaultValue: 'Needs a connection. A kept answer would be wrong, not old.' })} />
          </>
        ) : (
          /* Keyed by scope: a new workspace starts at its first tile, page 1 — and fades in. */
          <ScopeFade k={site ?? 'ALL'} slide>
            <Rail key={site ?? 'ALL'} state={s} viewerId={user?.id} onOpen={openAttendance} />
          </ScopeFade>
        )}

        {/* The exception rows — the only way to anything that changes a record. */}
        {!data.failed && (site ? data.pendingBySpace[site] ?? 0 : data.pending) > 0 ? (
          <ExceptionRow
            kind="waiting"
            title={t('crew.toApprove', { count: site ? data.pendingBySpace[site] ?? 0 : data.pending, defaultValue: 'shifts to approve' })}
            detail={site ? t('crew.inSpace', { name: siteName, defaultValue: `In ${siteName}` }) : t('crew.openAttendance', { defaultValue: 'Open attendance' })}
            onPress={openAttendance}
          />
        ) : null}
      </Well>
    </View>
  );
}

/* ================================================================ the grouped list */

/** `12` → "12 min"; past 90 minutes, hours — minutes above 90 are not read. */
function span(t: (k: string, o?: Record<string, unknown>) => string, n: number): string {
  if (n > 90) return `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, '0')}`;
  return t('crew.min', { n, defaultValue: `${n} min` });
}


const TILE = 118;
const GAP = 10;
const RING = 56;
/** How wide the fades are: a short one where you came from, a longer one where there is more. */
const FADE_LEFT = 16;
const FADE_RIGHT = 36;

/**
 * Fix 1 — the rail, cleaned (docs/design/crew + 02.png).
 *
 * ⚠️ NEVER A HARD CUT. The rail runs to the card's edge and FADES there, and
 * the next tile peeks in by about a third — a tile sliced mid-word
 * ("19h 04 l…") read as a clipping bug, not "swipe for more". Tiles snap, so
 * a flick never stops half-way, and page dots say where you are.
 *
 * ⚠️ EVERY TILE SAYS ITS REASON IN A WORD — Late, Missed, Free soon, Over,
 * Break. The ring stays, but nobody has to learn what a dashed red ring means.
 */
function Rail({ state: s, viewerId, onOpen }: { state: ReturnType<typeof crewState>; viewerId?: string; onOpen: () => void }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const pad = amazen.space(4.5);
  const [page, setPage] = useState(0);
  const tiles = s.tiles;
  const count = (b: Band) => tiles.filter((x) => x.band === b).length;
  const late = count('late');
  const missed = count('missed');
  const soon = count('freeSoon');
  const over = count('over') + count('breakOver');
  const parts = [
    late ? t('crew.say.late', { count: late, defaultValue: `${late} late` }) : null,
    missed ? t('crew.say.missed', { count: missed, defaultValue: `${missed} missed their shift` }) : null,
    soon ? t('crew.say.soon', { count: soon, defaultValue: `${soon} free soon` }) : null,
    over ? t('crew.say.over', { count: over, defaultValue: `${over} past their end` }) : null,
  ].filter(Boolean) as string[];
  const sentence = !parts.length
    ? (s.on ? t('crew.say.calm', { defaultValue: 'Everyone is in. Nothing to decide.' }) : t('crew.nobody', { defaultValue: 'Nobody is on shift right now.' }))
    : s.on === 0
      ? t('crew.say.noneIn', { list: parts.join(', '), defaultValue: `Nobody is in yet: ${parts.join(', ')}.` })
      : `${parts.join(', ')}.`;
  const pages = tiles.length;

  return (
    <View style={{ gap: amazen.space(3) }}>
      {/* ⚠️ A sentence says what matters; the number above it is the fact. */}
      <AText variant="body" tone={parts.length ? 'strong' : 'accent'} style={{ fontSize: 16, lineHeight: 22 }}>{sentence}</AText>

      {tiles.length ? (
        <View style={{ marginHorizontal: -pad }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={TILE + GAP}
            decelerationRate="fast"
            contentContainerStyle={{ gap: GAP, paddingHorizontal: pad }}
            onScroll={(e) => setPage(Math.min(pages - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / (TILE + GAP)))))}
            scrollEventThrottle={32}
          >
            {tiles.map((tile) => <TileView key={`${tile.person.userId}:${tile.person.spaceId ?? ""}:${tile.band}`} tile={tile} you={tile.person.userId === viewerId} showPlace={s.unit !== 'people'} onPress={onOpen} />)}
            {s.tilesOverflow > 0 ? (
              <View style={{ width: 70, alignItems: 'center', justifyContent: 'center' }}><AText variant="h3" tone="muted">+{s.tilesOverflow}</AText></View>
            ) : null}
          </ScrollView>
          {/* The fades: the well's own colour to transparent, over the rail's two ends. Touch passes through. */}
          <LinearGradient pointerEvents="none" colors={[c.well, `${c.well}00`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: FADE_LEFT }} />
          <LinearGradient pointerEvents="none" colors={[`${c.well}00`, c.well]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: FADE_RIGHT }} />
        </View>
      ) : null}

      {pages > 2 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
          {Array.from({ length: pages }).map((_, i) => (
            <View key={i} style={{ width: i === page ? 14 : 5, height: 3, borderRadius: 2, backgroundColor: i === page ? c.accent : c.lineGlass }} />
          ))}
        </View>
      ) : null}

      {s.steady.length ? (
        <AText variant="caption" tone="muted">
          {t('crew.steadyCount', { count: s.steady.length, defaultValue: `+${s.steady.length} steady · nothing to decide` })}
        </AText>
      ) : null}
    </View>
  );
}

const TAG: Record<Band, { key: string; fallback: string }> = {
  late: { key: 'crew.tag.late', fallback: 'Late' },
  missed: { key: 'crew.tag.missed', fallback: 'Missed' },
  freeSoon: { key: 'crew.tag.freeSoon', fallback: 'Free soon' },
  over: { key: 'crew.tag.over', fallback: 'Over' },
  breakOver: { key: 'crew.tag.breakOver', fallback: 'Long break' },
};

/**
 * One person: the reason in a word, the ring, the name, the place, the figure,
 * the span. ⚠️ The figure is time LEFT, not time worked; past 90 minutes it is
 * hours; a missed shift has no figure — they did not come.
 */
function TileView({ tile, you, showPlace, onPress }: { tile: CrewTile; you: boolean; showPlace: boolean; onPress: () => void }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const clock = useTimeFormat().formatClock;
  const c = amazen.color;
  const p = tile.person;
  const b = tile.band;
  const tone = b === 'late' ? c.critical : b === 'missed' ? c.inkMuted : b === 'freeSoon' ? c.accent : c.warn;
  const tint = b === 'late' ? c.criticalTint : b === 'missed' ? c.tile : b === 'freeSoon' ? c.accentTint : c.warnTint;
  const figure = b === 'missed' ? '—' : span(t, tile.minutes);
  const unit = b === 'late' ? t('crew.u.late', { defaultValue: 'late' })
    : b === 'missed' ? t('crew.u.missed', { defaultValue: 'did not come' })
    : b === 'freeSoon' ? t('crew.u.left', { defaultValue: 'left' })
    : b === 'over' ? t('crew.u.over', { defaultValue: 'over' })
    : t('crew.u.break', { defaultValue: 'on break' });
  const spanLine = b === 'late' ? t('crew.expectedAt', { time: clock(p.scheduledStartAt), defaultValue: `expected ${clock(p.scheduledStartAt)}` })
    : b === 'missed' ? `${clock(p.scheduledStartAt)}–${clock(p.expectedClockOutAt)}`
    : `${clock(p.clockInAt)} → ${p.expectedClockOutAt && !p.endIsDailyLimit ? clock(p.expectedClockOutAt) : '—'}`;
  const name = you ? t('crew.you', { defaultValue: 'You' }) : p.firstName;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${name}, ${t(TAG[b].key, { defaultValue: TAG[b].fallback })}, ${figure} ${unit}`}
      style={({ pressed }) => ({ width: TILE, borderRadius: 20, padding: 12, backgroundColor: c.tile, gap: 2, opacity: pressed ? 0.85 : 1 })}>
      {/* ⚠️ The reason, in a word. */}
      <View style={{ alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: tint, marginBottom: 8 }}>
        <AText variant="caption" numeric style={{ color: tone, fontSize: 9.5, letterSpacing: 1.1, textTransform: 'uppercase' }}>{t(TAG[b].key, { defaultValue: TAG[b].fallback })}</AText>
      </View>
      <View style={{ width: RING, height: RING, marginBottom: 8 }}>
        <RingSvg ring={tile.ring} tone={tone} />
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <AText variant="caption" tone="strong" style={{ fontSize: 13 }}>{initials(p)}</AText>
        </View>
      </View>
      <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14 }}>{name}</AText>
      {showPlace && p.spaceName ? <AText variant="caption" tone="muted" numberOfLines={1} style={{ fontSize: 11 }}>{p.spaceName}</AText> : null}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 8 }}>
        <AText variant="h3" numeric style={{ color: tone, fontSize: 18 }}>{figure}</AText>
        <AText variant="caption" tone="muted" style={{ fontSize: 11 }} numberOfLines={1}>{unit}</AText>
      </View>
      <AText variant="caption" tone="muted" numeric numberOfLines={1} style={{ fontSize: 10, marginTop: 4 }}>{spanLine}</AText>
    </Pressable>
  );
}

/**
 * The ring tells the shift.
 *
 *   arc      clock-in → expected out, as a fraction
 *   late     dashed crit, NO arc — no shift is underway to be a fraction of
 *   break    dashed warn arc; the shift clock still runs underneath
 *   over     full jade, then a warn tail past the top
 *   plain    present, no progress — no expected end, or only a daily cut-off
 */
function RingSvg({ ring, tone }: { ring: Ring; tone: string }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const R = 24;
  const C = 2 * Math.PI * R;
  const common = { cx: 28, cy: 28, r: R, fill: 'none', strokeWidth: 3 } as const;
  const rot = { rotation: -90, origin: '28, 28' } as const;
  const track = <Circle {...common} stroke={c.lineGlass} />;
  let body: React.ReactNode = null;
  switch (ring.kind) {
    case 'dashedLate': body = <Circle {...common} strokeWidth={2.5} stroke={tone} strokeDasharray="4 4" />; break;
    case 'plain': body = <Circle {...common} stroke={c.accent} />; break;
    case 'none': body = <Circle {...common} strokeWidth={2.5} stroke={c.lineGlass} strokeDasharray="3 5" />; break;
    case 'break': body = <>{track}<Circle {...common} {...rot} stroke={c.warn} strokeDasharray={`5 4`} /></>; break;
    case 'over': body = <><Circle {...common} stroke={c.accent} /><Circle {...common} {...rot} stroke={c.warn} strokeLinecap="round" strokeDasharray={`${C * 0.18} ${C}`} /></>; break;
    case 'arc': body = <>{track}<Circle {...common} {...rot} stroke={tone === c.critical ? c.accent : c.accent} strokeLinecap="round" strokeDasharray={`${Math.max(0.02, ring.fraction) * C} ${C}`} /></>; break;
  }
  return <Svg width={RING} height={RING} viewBox="0 0 56 56">{body}</Svg>;
}

function initials(p: CrewPerson): string {
  return `${(p.firstName ?? '').charAt(0)}${(p.lastName ?? '').charAt(0)}`.toUpperCase() || '·';
}

/* ================================================================ transitions */

/**
 * Fades (and, with `slide`, lifts) its children in whenever `k` changes —
 * the card changing scope reads as the SAME card answering again, not a jump.
 * ⚠️ Opacity and transform only: an animated style, never a layout animation.
 */
function ScopeFade({ k, slide, style, children }: { k: string; slide?: boolean; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  /*
    Out, swap, in — the old scope fades away before the new one arrives, so
    the reader never sees one answer replaced in place by another. While the
    scope holds, children render live (the minute refresh must not wait).
  */
  const v = useSharedValue(1);
  const [shownK, setShownK] = useState(k);
  const held = React.useRef(children);
  if (shownK === k) held.current = children;
  useEffect(() => {
    if (k === shownK) return;
    const swap = () => {
      setShownK(k);
      v.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
    };
    v.value = withTiming(0, { duration: 140, easing: Easing.in(Easing.quad) }, (done) => { if (done) runOnJS(swap)(); });
  }, [k, shownK, v]);
  const a = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: slide ? (1 - v.value) * 6 : 0 }] }));
  return <Reanimated.View style={[style, a]}>{held.current}</Reanimated.View>;
}

/* ================================================================ the scope rings */

const RING_SIZE = 34;

/**
 * ⭐ WHICH WORKSPACE THE CARD ANSWERS FOR — the rings under the number.
 *
 * Each workspace is a small ring: its initials on a filled disc, an arc of who
 * is in out of who is expected. The chosen one opens into a capsule with its
 * name and state; "All" is a ring too, and comes first.
 *
 * ⚠️ THE ARC IS NEVER RED. It says how full a place is, calmly — the missing
 * part is the plain track. Red lives only in the BADGE, the number of people
 * there who need you (late or missed); amber when only approvals wait. A red
 * arc on every workspace made the whole row read as an alarm.
 */
function ScopeRings({ spaces, people, needs, pending, current, now, onPick }: {
  spaces: { id: string; name: string }[];
  people: CrewPerson[];
  needs: Record<string, number>;
  pending: Record<string, number>;
  current: string | null;
  now: number;
  onPick: (spaceId: string | null) => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const pad = amazen.space(4.5);
  const c = amazen.color;
  void now;
  const statOf = (id: string | null) => {
    const ps = id ? people.filter((p) => p.spaceId === id) : people;
    const inn = ps.filter((p) => !!p.clockInAt).length;
    const need = id ? needs[id] ?? 0 : Object.values(needs).reduce((a, b) => a + b, 0);
    const appr = id ? pending[id] ?? 0 : Object.values(pending).reduce((a, b) => a + b, 0);
    return { inn, exp: ps.length, need, appr };
  };
  /* Worst first: people who need you, then approvals. */
  const order = [...spaces].sort((a, b) => (needs[b.id] ?? 0) - (needs[a.id] ?? 0) || (pending[b.id] ?? 0) - (pending[a.id] ?? 0));

  return (
    <View style={{ marginHorizontal: -pad, marginTop: 6 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: pad, gap: 7, alignItems: 'center' }}>
        <RingButton label={t('crew.allWorkspacesShort', { count: spaces.length, defaultValue: `All ${spaces.length} workspaces` })} initials={t('crew.all0', { defaultValue: 'All' })}
          stat={statOf(null)} on={current === null} onPress={() => onPick(null)} />
        <View style={{ width: 1, height: 20, backgroundColor: c.lineGlass }} />
        {order.map((sp) => (
          <RingButton key={sp.id} label={sp.name} initials={ringInitials(sp.name)}
            stat={statOf(sp.id)} on={current === sp.id} onPress={() => onPick(sp.id)} />
        ))}
      </ScrollView>
      <LinearGradient pointerEvents="none" colors={[c.well, `${c.well}00`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 14 }} />
      <LinearGradient pointerEvents="none" colors={[`${c.well}00`, c.well]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 26 }} />
    </View>
  );
}

/** Two letters: the first of two words ("Main Office" → MO), or the first two of one ("Warehouse" → WA). */
function ringInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const two = words.length > 1 ? words[0]!.charAt(0) + words[1]!.charAt(0) : (words[0] ?? '').slice(0, 2);
  return two.toUpperCase() || '·';
}

function RingButton({ label, initials: ini, stat, on, onPress }: {
  label: string; initials: string; stat: { inn: number; exp: number; need: number; appr: number }; on: boolean; onPress: () => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const R = 14.5;
  const C = 2 * Math.PI * R;
  const f = stat.exp ? stat.inn / stat.exp : 1;
  const status = stat.need
    ? { text: t('crew.needYou', { count: stat.need, defaultValue: `${stat.need} need you` }), color: c.critical }
    : stat.appr
      ? { text: t('crew.toApproveShort', { count: stat.appr, defaultValue: `${stat.appr} to approve` }), color: c.warn }
      : { text: t('crew.allIn', { defaultValue: 'all in' }), color: c.accent };
  /* One progress value drives the capsule: its fill, its width, its text. */
  const progress = useSharedValue(on ? 1 : 0);
  const [labelW, setLabelW] = useState(0);
  useEffect(() => { progress.value = withTiming(on ? 1 : 0, { duration: 320, easing: Easing.out(Easing.cubic) }); }, [on, progress]);
  const labelBox = useAnimatedStyle(() => ({ width: progress.value * labelW, height: 36, overflow: 'hidden', opacity: progress.value }));
  const capsuleBg = useAnimatedStyle(() => ({ opacity: progress.value }));
  const badge = !on && (stat.need || stat.appr) ? { n: stat.need || stat.appr, color: stat.need ? c.critical : c.warn, ink: stat.need ? c.criticalInk : c.warnInk } : null;

  const labelBody = (
    <View style={{ paddingLeft: 6, paddingRight: 12, gap: 1 }}>
      <AText variant="caption" tone="strong" numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '500' }}>{label}</AText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <View style={{ paddingHorizontal: 5, borderRadius: 5, backgroundColor: c.tile }}>
          <AText variant="caption" tone="strong" numeric style={{ fontSize: 9.5 }}>{stat.inn}/{stat.exp}</AText>
        </View>
        <AText variant="caption" numberOfLines={1} style={{ fontSize: 10, color: status.color, fontWeight: '500' }}>{status.text}</AText>
      </View>
    </View>
  );

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      accessibilityLabel={`${label}, ${stat.inn} of ${stat.exp} in, ${status.text}`}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', height: 38, borderRadius: 999, padding: 1,
        transform: [{ scale: pressed ? 0.94 : 1 }],
      })}>
      <Reanimated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999, borderWidth: 1, borderColor: `${c.accent}66`, backgroundColor: c.accentTint }, capsuleBg]} />
      <View style={{ width: RING_SIZE, height: RING_SIZE }}>
        <Svg width={RING_SIZE} height={RING_SIZE} viewBox="0 0 34 34">
          <Circle cx={17} cy={17} r={11.5} fill={on ? c.accentTint : c.tile} />
          <Circle cx={17} cy={17} r={R} fill="none" stroke={c.lineGlass} strokeWidth={2.5} />
          {f > 0 ? (
            <Circle cx={17} cy={17} r={R} fill="none" stroke={c.accent} strokeWidth={2.5} strokeLinecap="round"
              strokeDasharray={`${Math.max(0.5, f * C)} ${C}`} rotation={-90} origin="17, 17" />
          ) : null}
        </Svg>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <AText variant="caption" style={{ fontSize: 9.5, fontWeight: '600', color: on ? c.accent : c.inkStrong }}>{ini}</AText>
        </View>
        {badge ? (
          <View style={{ position: 'absolute', left: 22, top: -3, minWidth: 15, height: 15, paddingHorizontal: 3, borderRadius: 8, backgroundColor: badge.color, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.well }}>
            <AText variant="caption" numeric style={{ fontSize: 8.5, lineHeight: 10, color: badge.ink }}>{badge.n}</AText>
          </View>
        ) : null}
      </View>
      {/*
        ⚠️ THE CAPSULE GROWS, IT DOES NOT SNAP. The label is always there, in a
        box whose WIDTH is animated from 0 to the label's own measured width —
        an animated style, never a Reanimated `layout`/`entering` prop, which
        corrupted the home column on Android (mobile-cross-platform-traps).
      */}
      <Reanimated.View style={labelBox}>
        {/*
          ⚠️ MEASURED OFF-STAGE, DRAWN AT A FIXED WIDTH. Measured inside the
          growing box, the text wrapped at every step and each onLayout fed a
          new width back into the animation — the capsule flickered open and
          shut. The measurer sits in a wide absolute frame, so it reports the
          label's own width, once; the drawn label never reflows.
        */}
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: 600, opacity: 0 }}>
          <View style={{ alignSelf: 'flex-start' }}
            onLayout={(e) => { const w = Math.ceil(e.nativeEvent.layout.width); if (w !== labelW) setLabelW(w); }}>
            {labelBody}
          </View>
        </View>
        <View style={{ width: labelW, height: 36, justifyContent: 'center' }}>{labelW ? labelBody : null}</View>
      </Reanimated.View>
    </Pressable>
  );
}

function Message({ text, dim }: { text: string; dim?: boolean }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), backgroundColor: c.tile, borderRadius: 16, padding: amazen.space(3) }}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: dim ? c.tile : c.accentTint, alignItems: 'center', justifyContent: 'center' }}>
        <AText variant="body" tone={dim ? 'muted' : 'accent'}>{dim ? '◌' : '✓'}</AText>
      </View>
      <AText variant="body" tone="ink" style={{ flex: 1 }}>{text}</AText>
    </View>
  );
}



function ExceptionRow({ kind, title, detail, onPress }: { kind: 'late' | 'waiting'; title: string; detail: string; onPress: () => void }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const late = kind === 'late';
  return (
    <WellDoor
      title={title}
      detail={detail}
      onPress={onPress}
      lead={<GlyphTile Glyph={late ? NotArrivedGlyph : HoursWaitingGlyph} color={late ? c.critical : c.warn} tint={late ? c.criticalTint : c.warnTint} behind={c.well} size={34} glyphSize={20} />}
    />
  );
}
