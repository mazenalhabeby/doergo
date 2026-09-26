import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { holds } from '../../lib/permissions';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { AText, Eyebrow, Well, WellDivider } from '../amazen';
import { NotArrivedGlyph, HoursWaitingGlyph } from '../glyphs/crew-glyphs';
import { crewState, CAPS, type CrewPerson, type CrewTile, type Ring, type SiteRow } from './crew-state';
import { useCrew } from './use-crew';

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
  const [site, setSite] = useState<string | null>(null);
  const [shortOnly, setShortOnly] = useState(false);
  const { formatTime } = useTimeFormat();

  const allSpaces = useMemo(() => [...new Set(data.people.map((p) => p.spaceId).filter((x): x is string => !!x))], [data.people]);
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

  const notArrived = s.tiles.filter((x) => x.band === 'late');
  const siteRows = shortOnly ? s.sites.filter((x) => !!x.trouble) : s.sites;
  const withSite = s.unit === 'peopleWithSite';

  return (
    <View style={style}>
      <Well style={{ padding: amazen.space(4.5), gap: amazen.space(3) }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
          <Eyebrow tone="muted" style={{ flex: 1 }}>{t('widgets.crew', { defaultValue: 'Crew' })}</Eyebrow>
          {!data.failed ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent }} />
              <AText variant="caption" tone="accent" numeric>{formatTime(new Date(data.at).toISOString())}</AText>
            </View>
          ) : null}
        </View>

        {site ? (
          <Pressable onPress={() => setSite(null)} accessibilityRole="button" hitSlop={8}>
            <Eyebrow tone="accent">‹ {t('crew.allWorkspaces', { count: allSpaces.length, defaultValue: `All ${allSpaces.length} workspaces` })}</Eyebrow>
          </Pressable>
        ) : null}

        {/* The hero. ⚠️ The "/n" is dropped when there is no roster — never a copy of the numerator. */}
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <AText variant="display" tone={data.failed ? 'muted' : 'strong'} numeric style={{ fontSize: 56, lineHeight: 60 }}>
              {data.failed ? '—' : String(s.on)}
            </AText>
            {!data.failed && s.rostered != null ? <AText variant="h2" tone="muted" numeric style={{ fontWeight: '300' }}>/{s.rostered}</AText> : null}
            <AText variant="body" tone="muted">{t('crew.onTheClock', { defaultValue: 'on the clock' })}</AText>
          </View>
          {sub ? <Eyebrow tone="muted" numberOfLines={1}>{sub}</Eyebrow> : null}
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
        ) : s.unit === 'workspaces' && !site ? (
          <>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <FilterChip label={t('crew.all', { count: allSpaces.length, defaultValue: `All ${allSpaces.length}` })} on={!shortOnly} onPress={() => setShortOnly(false)} />
              <FilterChip label={t('crew.short', { count: s.sites.filter((x) => !!x.trouble).length, defaultValue: `Short ${s.sites.filter((x) => !!x.trouble).length}` })} on={shortOnly} onPress={() => setShortOnly(true)} />
            </View>
            {siteRows.map((row) => <SiteRowView key={row.spaceId} row={row} people={data.people} onPress={() => setSite(row.spaceId)} />)}
            {s.sitesOverflow > 0 && !shortOnly ? (
              <AText variant="caption" tone="accent" style={{ paddingLeft: 15 }}>
                {t('crew.moreSites', { count: s.sitesOverflow, defaultValue: `+${s.sitesOverflow} workspaces` })}
              </AText>
            ) : null}
          </>
        ) : s.kind === 'busy' ? (
          <>
            {/* ⚠️ The rail scrolls sideways, never wraps: three tiles and nine are the same height. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} style={{ marginHorizontal: -amazen.space(4.5) }}>
              <View style={{ width: amazen.space(4.5) - 10 }} />
              {s.tiles.map((tile) => <TileView key={tile.person.userId} tile={tile} withSite={withSite} now={data.at} onPress={openAttendance} />)}
              {s.tilesOverflow > 0 ? (
                <View style={{ width: 70, alignItems: 'center', justifyContent: 'center' }}><AText variant="h3" tone="muted">+{s.tilesOverflow}</AText></View>
              ) : null}
              <View style={{ width: amazen.space(4.5) - 10 }} />
            </ScrollView>
            {s.steady.length ? <Steady people={s.steady} /> : null}
          </>
        ) : s.kind === 'calm' ? (
          <>
            <Message text={t('crew.calm', { defaultValue: 'Everyone expected is in. Nothing to decide.' })} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {s.steady.slice(0, 27).map((p) => <Initials key={p.userId} person={p} />)}
              {s.steady.length > 27 ? <AText variant="caption" tone="muted">+{s.steady.length - 27}</AText> : null}
            </View>
          </>
        ) : (
          <Message dim text={t('crew.nobody', { defaultValue: 'Nobody is on shift right now.' })} />
        )}

        {/* The exception rows — the only way to anything that changes a record. */}
        {!data.failed && notArrived.length ? (
          <ExceptionRow
            kind="late"
            title={t('crew.notArrived', { count: notArrived.length, defaultValue: `${notArrived.length} not arrived` })}
            detail={s.unit === 'workspaces' && !site
              ? t('crew.acrossLate', { count: new Set(notArrived.map((x) => x.person.spaceId)).size, oldest: Math.max(...notArrived.map((x) => x.minutes)), defaultValue: 'Across workspaces' })
              : [...notArrived.slice(0, CAPS.exceptionNames).map((x) => `${x.person.firstName} ${x.person.lastName ?? ''}`.trim() + ` ${x.minutes} min`),
                  notArrived.length > CAPS.exceptionNames ? t('crew.more', { count: notArrived.length - CAPS.exceptionNames, defaultValue: `${notArrived.length - CAPS.exceptionNames} more` }) : null,
                ].filter(Boolean).join(' · ')}
            onPress={openAttendance}
          />
        ) : null}
        {!data.failed && data.pending > 0 && !site ? (
          <ExceptionRow
            kind="waiting"
            title={t('crew.waiting', { count: data.pending, defaultValue: `${data.pending} shifts waiting` })}
            detail={t('crew.waitingDetail', { defaultValue: 'Done, and waiting for somebody to approve them' })}
            onPress={openAttendance}
          />
        ) : null}
      </Well>
    </View>
  );
}

/* ================================================================ the tile */

const TILE = 118;
const RING = 56;

/**
 * One person, six lines: the ring, the dot, the name, the place, the figure,
 * the span.
 *
 * ⚠️ THE FIGURE IS TIME LEFT, NOT TIME WORKED. A manager at 13:20 needs to know
 * Pia is free in 25 minutes.
 */
function TileView({ tile, withSite, now, onPress }: { tile: CrewTile; withSite: boolean; now: number; onPress: () => void }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const { formatTime } = useTimeFormat();
  const c = amazen.color;
  const p = tile.person;
  const band = tile.band;
  const tone = band === 'late' ? c.critical : band === 'freeSoon' ? c.accent : c.warn;
  const dot = band === 'late' ? c.critical : band === 'breakOver' ? 'transparent' : band === 'over' ? c.warn : c.accent;
  const n = tile.minutes;
  const big = band === 'over' ? `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, '0')}` : n >= 60 && band === 'late' ? `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, '0')}` : String(n);
  const unit = band === 'late' ? (n >= 60 ? t('crew.late', { defaultValue: 'late' }) : t('crew.minLate', { defaultValue: 'min late' }))
    : band === 'freeSoon' ? t('crew.minLeft', { defaultValue: 'min left' })
    : band === 'over' ? t('crew.over', { defaultValue: 'over' })
    : t('crew.minBreak', { defaultValue: 'min break' });
  const span = band === 'late'
    ? `${t('crew.expected', { defaultValue: 'Expected' })} ${p.scheduledStartAt ? formatTime(p.scheduledStartAt) : ''}`
    : `${p.clockInAt ? formatTime(p.clockInAt) : ''} → ${p.expectedClockOutAt && !p.endIsDailyLimit ? formatTime(p.expectedClockOutAt) : '—'}`;
  void now;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${p.firstName}, ${big} ${unit}`}
      style={({ pressed }) => ({ width: TILE, borderRadius: 20, padding: 12, backgroundColor: c.tile, gap: 2, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ width: RING, height: RING, marginBottom: 8 }}>
        <RingSvg ring={tile.ring} tone={tone} />
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          <AText variant="caption" tone="strong" style={{ fontSize: 13 }}>{initials(p)}</AText>
        </View>
        <View style={{ position: 'absolute', right: 3, bottom: 3, width: 10, height: 10, borderRadius: 5, backgroundColor: dot, borderWidth: band === 'breakOver' ? 2 : 2, borderColor: band === 'breakOver' ? c.warn : c.well }} />
      </View>
      {/* ⚠️ First name only. A row of initials is a puzzle. */}
      <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14 }}>{p.firstName}</AText>
      {/* The place decides whether you can walk over. */}
      <AText variant="caption" tone="muted" numberOfLines={1} style={{ fontSize: 11 }}>{withSite || !p.spaceName ? p.spaceName ?? '' : p.spaceName}</AText>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 8 }}>
        <AText variant="h3" numeric style={{ color: tone, fontSize: 19 }}>{big}</AText>
        <AText variant="caption" tone="muted" style={{ fontSize: 11 }}>{unit}</AText>
      </View>
      <AText variant="caption" tone="muted" numeric numberOfLines={1} style={{ fontSize: 9.5, letterSpacing: 0.6, marginTop: 4, textTransform: 'uppercase' }}>{span}</AText>
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
    case 'dashedLate': body = <Circle {...common} strokeWidth={2.5} stroke={c.critical} strokeDasharray="4 4" />; break;
    case 'plain': body = <Circle {...common} stroke={c.accent} />; break;
    case 'none': body = <Circle {...common} strokeWidth={2.5} stroke={c.lineGlass} strokeDasharray="3 5" />; break;
    case 'break': body = <>{track}<Circle {...common} {...rot} stroke={c.warn} strokeDasharray={`5 4`} /></>; break;
    case 'over': body = <><Circle {...common} stroke={c.accent} /><Circle {...common} {...rot} stroke={c.warn} strokeLinecap="round" strokeDasharray={`${C * 0.18} ${C}`} /></>; break;
    case 'arc': body = <>{track}<Circle {...common} {...rot} stroke={tone === c.critical ? c.accent : c.accent} strokeLinecap="round" strokeDasharray={`${Math.max(0.02, ring.fraction) * C} ${C}`} /></>; break;
  }
  return <Svg width={RING} height={RING} viewBox="0 0 56 56">{body}</Svg>;
}

/* ================================================================ small parts */

function initials(p: CrewPerson): string {
  return `${(p.firstName ?? '').charAt(0)}${(p.lastName ?? '').charAt(0)}`.toUpperCase() || '·';
}

function Initials({ person }: { person: CrewPerson }) {
  const { amazen } = useTheme();
  return (
    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: amazen.color.accentTint, alignItems: 'center', justifyContent: 'center' }}>
      <AText variant="caption" tone="accent" style={{ fontSize: 9.5 }}>{initials(person)}</AText>
    </View>
  );
}

/** Everyone with nothing to decide about them — one chip with a count. */
function Steady({ people }: { people: CrewPerson[] }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const faces = people.slice(0, CAPS.steadyFaces);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
      <View style={{ flexDirection: 'row' }}>
        {faces.map((p, i) => (
          <View key={p.userId} style={{ marginLeft: i ? -6 : 0, borderRadius: 15, borderWidth: 2, borderColor: amazen.color.well }}><Initials person={p} /></View>
        ))}
      </View>
      <AText variant="caption" tone="ink" numeric>
        {people.length > faces.length ? `+${people.length - faces.length} ` : ''}{t('crew.steady', { defaultValue: 'steady' })}
      </AText>
      <AText variant="caption" tone="muted" style={{ marginLeft: 'auto' }}>{t('crew.nothingToDecide', { defaultValue: 'Nothing to decide.' })}</AText>
    </View>
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

function FilterChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: on ? c.accentTint : c.tile, borderWidth: 1.5, borderColor: on ? c.accent : 'transparent' }}>
      <AText variant="caption" tone={on ? 'accent' : 'ink'}>{label}</AText>
    </Pressable>
  );
}

/** A site row is the same card in miniature — a count, a presence bar, what is wrong. */
function SiteRowView({ row, people, onPress }: { row: SiteRow; people: CrewPerson[]; onPress: () => void }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const total = people.filter((p) => p.spaceId === row.spaceId).length;
  const tone = row.trouble ? (row.trouble.band === 'late' ? c.critical : c.warn) : c.accent;
  const issue = row.trouble
    ? t(`crew.issue.${row.trouble.band}`, { count: row.trouble.count, defaultValue: `${row.trouble.count} ${row.trouble.band}` })
    : null;
  const segs = Math.min(total, 14);
  const onSegs = total ? Math.round((row.on / total) * segs) : 0;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ gap: 7, paddingVertical: 6, opacity: pressed ? 0.8 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tone }} />
        <AText variant="body" tone="strong" numberOfLines={1} style={{ flex: 1, fontSize: 14 }}>{row.spaceName}</AText>
        {issue ? <AText variant="caption" numeric style={{ color: tone, fontSize: 11 }}>{issue}</AText> : null}
        <AText variant="caption" tone="muted" numeric>{row.on}/{total}</AText>
        <AText variant="body" tone="muted">›</AText>
      </View>
      <View style={{ flexDirection: 'row', gap: 3, paddingLeft: 15 }}>
        {Array.from({ length: segs }).map((_, i) => (
          <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i < onSegs ? tone : c.lineGlass }} />
        ))}
      </View>
    </Pressable>
  );
}

function ExceptionRow({ kind, title, detail, onPress }: { kind: 'late' | 'waiting'; title: string; detail: string; onPress: () => void }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const Glyph = kind === 'late' ? NotArrivedGlyph : HoursWaitingGlyph;
  const tone = kind === 'late' ? c.critical : c.warn;
  return (
    <>
      <WellDivider />
      <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), opacity: pressed ? 0.8 : 1 })}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: kind === 'late' ? c.criticalTint : c.warnTint, alignItems: 'center', justifyContent: 'center' }}>
          <Glyph size={20} color={tone} contrast={kind === 'late' ? c.criticalTint : c.warnTint} />
        </View>
        <View style={{ flex: 1 }}>
          <AText variant="body" tone="strong" style={{ fontSize: 14 }}>{title}</AText>
          <AText variant="caption" tone="muted" numberOfLines={1}>{detail}</AText>
        </View>
        <AText variant="body" tone="muted">›</AText>
      </Pressable>
    </>
  );
}
