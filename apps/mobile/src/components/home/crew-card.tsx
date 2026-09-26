import React, { useMemo, useState } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { holds } from '../../lib/permissions';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { AText, Eyebrow, Well, WellDivider } from '../amazen';
import { NotArrivedGlyph, HoursWaitingGlyph } from '../glyphs/crew-glyphs';
import { MessagesGlyph } from '../glyphs/glyphs';
import { crewState, CAPS, type Band, type CrewPerson, type CrewTile, type SiteRow } from './crew-state';
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

  return (
    <View style={style}>
      <Well style={{ padding: amazen.space(4.5), gap: amazen.space(3) }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
          <Eyebrow tone="muted" style={{ flex: 1 }}>{t('widgets.crew', { defaultValue: 'Crew' })}</Eyebrow>
          {!data.failed ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent }} />
              <AText variant="caption" tone="accent" numeric>{formatTime(new Date(data.at).toISOString()).replace(/\s+[A-Z]{2,5}$/, '')}</AText>
            </View>
          ) : null}
        </View>

        {site ? (
          <Pressable onPress={() => setSite(null)} accessibilityRole="button" hitSlop={8}>
            <Eyebrow tone="accent">‹ {t('crew.allWorkspaces', { count: allSpaces.length, defaultValue: `All ${allSpaces.length} workspaces` })}</Eyebrow>
          </Pressable>
        ) : null}

        {/* The hero. ⚠️ The "/n" is dropped when there is no roster — never a copy of the numerator. */}
        {data.failed || (s.unit === 'workspaces' && !site) ? <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <AText variant="display" tone={data.failed ? 'muted' : 'strong'} numeric style={{ fontSize: 56, lineHeight: 60 }}>
              {data.failed ? '—' : String(s.on)}
            </AText>
            {!data.failed && s.rostered != null ? <AText variant="h2" tone="muted" numeric style={{ fontWeight: '300' }}>/{s.rostered}</AText> : null}
            <AText variant="body" tone="muted">{t('crew.onTheClock', { defaultValue: 'on the clock' })}</AText>
          </View>
          {sub ? <Eyebrow tone="muted" numberOfLines={1}>{sub}</Eyebrow> : null}
        </View> : sub ? <Eyebrow tone="muted" numberOfLines={1}>{sub}</Eyebrow> : null}

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
        ) : (
          <Grouped state={s} viewerId={user?.id} onOpen={openAttendance}
            onMessage={(id) => router.push({ pathname: '/chat', params: { userId: id } } as never)} />
        )}

        {/* The exception rows — the only way to anything that changes a record. */}
        {!data.failed && notArrived.length && s.unit === 'workspaces' && !site ? (
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
            title={t('crew.toApprove', { count: data.pending, defaultValue: `${data.pending} shifts to approve` })}
            detail={t('crew.openAttendance', { defaultValue: 'Open attendance' })}
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

/** HH:mm in the member's own 12/24h preference, without the zone suffix that cut every line off. */
function useClock() {
  const { formatTime } = useTimeFormat();
  return (iso?: string | null) => (iso ? formatTime(iso).replace(/\s+[A-Z]{2,5}$/, '') : '');
}

const GROUPS: { band: Band; label: string; fallback: string }[] = [
  { band: 'late', label: 'crew.group.late', fallback: 'Late' },
  { band: 'missed', label: 'crew.group.missed', fallback: 'Missed today' },
  { band: 'freeSoon', label: 'crew.group.freeSoon', fallback: 'Free soon' },
  { band: 'over', label: 'crew.group.over', fallback: 'Past their end' },
  { band: 'breakOver', label: 'crew.group.breakOver', fallback: 'Break too long' },
];
const PER_GROUP = 3;

/**
 * ⚠️ NO SIDEWAYS SCROLL. People are grouped by what you do about them — the
 * reason is the heading, the count beside it — so the card reads in one
 * glance (02.png: a rail cut hard at the card edge read as a bug). A sentence
 * says what matters first; a bar shows the whole day in one line.
 */
function Grouped({ state: s, viewerId, onOpen, onMessage }: {
  state: ReturnType<typeof crewState>; viewerId?: string; onOpen: () => void; onMessage: (userId: string) => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const all = [...s.tiles];
  const count = (b: Band) => all.filter((x) => x.band === b).length;
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

  const segs = [...Array(s.on).fill('on'), ...Array(late).fill('late'), ...Array(missed).fill('missed')].slice(0, 40);

  return (
    <View style={{ gap: amazen.space(3) }}>
      <AText variant="body" tone={parts.length ? 'strong' : 'accent'} style={{ fontSize: 16, lineHeight: 22 }}>{sentence}</AText>

      {segs.length ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {segs.map((k, i) => (
              <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: k === 'on' ? c.accent : c.critical, opacity: k === 'missed' ? 0.45 : 1 }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: amazen.space(3) }}>
            <Key color={c.accent} text={t('crew.key.in', { count: s.on, defaultValue: `${s.on} in` })} />
            {late ? <Key color={c.critical} text={t('crew.key.late', { count: late, defaultValue: `${late} late` })} /> : null}
            {missed ? <Key color={c.critical} dim text={t('crew.key.missed', { count: missed, defaultValue: `${missed} missed` })} /> : null}
          </View>
        </View>
      ) : null}

      {GROUPS.map(({ band, label, fallback }) => {
        const g = all.filter((x) => x.band === band);
        if (!g.length) return null;
        const tone = band === 'late' || band === 'missed' ? c.critical : band === 'freeSoon' ? c.accent : c.warn;
        return (
          <View key={band} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Eyebrow style={{ flex: 1, color: tone }}>{t(label, { defaultValue: fallback })}</Eyebrow>
              <AText variant="caption" numeric style={{ color: tone }}>{g.length}</AText>
            </View>
            {g.slice(0, PER_GROUP).map((tile) => (
              <PersonRow key={tile.person.userId} tile={tile} tone={tone} you={tile.person.userId === viewerId} showPlace={s.unit !== 'people'} onPress={onOpen} onMessage={onMessage} />
            ))}
            {g.length > PER_GROUP ? (
              <Pressable onPress={onOpen} accessibilityRole="button" hitSlop={6}>
                <AText variant="caption" tone="accent" style={{ paddingHorizontal: 4 }}>{t('crew.moreIn', { count: g.length - PER_GROUP, defaultValue: `+${g.length - PER_GROUP} more` })}</AText>
              </Pressable>
            ) : null}
          </View>
        );
      })}

      {s.steady.length ? (
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Eyebrow tone="muted" style={{ flex: 1 }}>{t('crew.group.steady', { defaultValue: 'Steady' })}</Eyebrow>
            <AText variant="caption" tone="muted" numeric>{s.steady.length}</AText>
          </View>
          <AText variant="caption" tone="muted">{t('crew.steadyLine', { defaultValue: 'In and on plan. Nothing to decide.' })}</AText>
        </View>
      ) : null}
    </View>
  );
}

function Key({ color, text, dim }: { color: string; text: string; dim?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color, opacity: dim ? 0.45 : 1 }} />
      <AText variant="caption" tone="muted" style={{ fontSize: 11 }}>{text}</AText>
    </View>
  );
}

/** One person: who, where and since when, the figure, and one button. */
function PersonRow({ tile, tone, you, showPlace, onPress, onMessage }: {
  tile: CrewTile; tone: string; you: boolean;
  /** One workspace: its name is in the header already, and repeating it cut the time off. */
  showPlace: boolean;
  onPress: () => void; onMessage: (userId: string) => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const clock = useClock();
  const c = amazen.color;
  const p = tile.person;
  const b = tile.band;
  const name = you ? t('crew.you', { defaultValue: 'You' }) : `${p.firstName} ${p.lastName ?? ''}`.trim();
  const when = b === 'late' ? t('crew.expectedAt', { time: clock(p.scheduledStartAt), defaultValue: `expected ${clock(p.scheduledStartAt)}` })
    : b === 'missed' ? t('crew.shiftWas', { from: clock(p.scheduledStartAt), to: clock(p.expectedClockOutAt), defaultValue: `shift ${clock(p.scheduledStartAt)}–${clock(p.expectedClockOutAt)}` })
    : `${clock(p.clockInAt)} → ${p.expectedClockOutAt && !p.endIsDailyLimit ? clock(p.expectedClockOutAt) : '—'}`;
  const figure = b === 'missed' ? null : span(t, tile.minutes);
  const unit = b === 'late' ? t('crew.u.late', { defaultValue: 'late' })
    : b === 'missed' ? t('crew.u.missed', { defaultValue: 'did not come' })
    : b === 'freeSoon' ? t('crew.u.left', { defaultValue: 'left' })
    : b === 'over' ? t('crew.u.over', { defaultValue: 'over' })
    : t('crew.u.break', { defaultValue: 'on break' });
  const tint = b === 'freeSoon' ? c.accentTint : b === 'over' || b === 'breakOver' ? c.warnTint : c.criticalTint;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${name}, ${figure ?? ''} ${unit}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), padding: amazen.space(2.5), borderRadius: 14, backgroundColor: c.tile, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
        <AText variant="caption" style={{ color: tone, fontSize: 11.5 }}>{initials(p)}</AText>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14 }}>{name}</AText>
        <AText variant="caption" tone="muted" numberOfLines={1}>{[showPlace ? p.spaceName : null, when].filter(Boolean).join(' · ')}</AText>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {figure ? <AText variant="body" numeric style={{ color: tone, fontSize: 13 }}>{figure}</AText> : null}
        <AText variant="caption" tone="muted" style={{ fontSize: 10.5 }}>{unit}</AText>
      </View>
      {/* ⚠️ One button, and it is a message: members carry no phone number yet, so Call cannot be real. */}
      {!you ? (
        <Pressable onPress={() => onMessage(p.userId)} accessibilityRole="button" hitSlop={6}
          accessibilityLabel={t('crew.message', { name: p.firstName, defaultValue: `Message ${p.firstName}` })}
          style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.well, borderWidth: 1.5, borderColor: c.lineGlass, opacity: pressed ? 0.8 : 1 })}>
          <MessagesGlyph size={17} color={c.accent} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function initials(p: CrewPerson): string {
  return `${(p.firstName ?? '').charAt(0)}${(p.lastName ?? '').charAt(0)}`.toUpperCase() || '·';
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
