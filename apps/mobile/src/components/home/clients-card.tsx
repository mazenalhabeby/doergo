import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { over } from '../../theme/amazen';
import { customersApi, type ClientsDue, type DueReminder } from '../../lib/api/customers';
import { useQueuedWrite } from '../../offline/actions/queued-write';
import { setActivityDoneFromPhone } from '../../offline/crm/client-actions';
import { useToast } from '../../island/island-context';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { AText, Eyebrow, Well } from '../amazen';
import { useLiveRefresh } from '../../hooks/use-live-refresh';
import { usePhrase } from './phrase';
import { GlyphTile } from './glyph-tile';
import { WellDoor } from './well-door';
import { CallGlyph, FinishGlyph } from '../glyphs/work-glyphs';
import { EmailGlyph, ColdGlyph, ClientCompanyGlyph, ClientPersonGlyph } from '../glyphs/crm-glyphs';
import { initials } from '../customer/client-avatar';
import { daysLate, headline, localDay, rowLines } from './clients-state';

/**
 * ⭐ CLIENTS — `docs/design/clients`. What is owed today, what is going cold,
 * and the way through to the book.
 *
 * ⭐ THE ROW IS THE ACT. Every other widget is a doorway; a reminder exists to
 * be discharged, so the row finishes the errand where it stands: the jade
 * disc rings or writes (`tel:` / `mailto:`), the grey disc marks it done and
 * the row leaves. Two discs is the ceiling — a third turns it into a form, and
 * the client screen behind it already is one.
 *
 * ⭐ "ALL CLIENTS" IS ON EVERY STATE — empty, loading, offline. The book is why
 * the module was bought; a card that only shows up on bad days hides it.
 *
 * One read (`GET /customers/due`), narrowed on the server to what the caller
 * may see and to reminders that are theirs.
 */

const ROWS = 3;
const REFRESH_MS = 60_000;

export function ClientsCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const { amazen, isDark } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const write = useQueuedWrite();
  const { formatClock } = useTimeFormat();

  const [due, setDue] = useState<ClientsDue | null>(null);
  const [failed, setFailed] = useState(false);
  const day = useRef(localDay());
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const refresh = useCallback(async () => {
    day.current = localDay();
    try {
      const d = await customersApi.due(day.current, ROWS);
      if (live.current) { setDue(d); setFailed(false); }
    } catch {
      if (live.current) setFailed(true);
    }
  }, []);

  useLiveRefresh(refresh, REFRESH_MS);
  const say = usePhrase();
  const openBook = () => router.push('/(app)/customers' as Href);
  const openClient = (r: DueReminder) => router.push(`/(app)/customer/${r.customerId}` as Href);

  /* The jade disc: the act itself. No number or address on file → the client, where one can be added. */
  const act = (r: DueReminder) => {
    const url = r.kind === 'CALL' && r.phone ? `tel:${r.phone.replace(/\s+/g, '')}` : r.kind === 'EMAIL' && r.email ? `mailto:${r.email}` : null;
    if (!url) { openClient(r); return; }
    Linking.openURL(url).catch(() => openClient(r));
  };

  /* The grey disc: done. Leaves at once; the queue keeps it done with no signal. */
  const done = async (r: DueReminder) => {
    setDue((d) => {
      if (!d) return d;
      const k = r.kind === 'CALL' ? 'call' : r.kind === 'EMAIL' ? 'email' : 'other';
      const late = daysLate(r.dueAt, day.current.start) != null;
      return {
        ...d,
        items: d.items.filter((x) => x.id !== r.id),
        total: Math.max(0, d.total - 1),
        counts: { ...d.counts, [k]: Math.max(0, d.counts[k] - 1), overdue: Math.max(0, d.counts.overdue - (late ? 1 : 0)) },
      };
    });
    const outcome = await write.run(
      (e) => setActivityDoneFromPhone(e, { customerId: r.customerId, activityId: r.id, done: true }),
      () => customersApi.updateActivity(r.customerId, r.id, { done: true }),
    );
    if (outcome.kind === 'refused') {
      toast.error((outcome as { message?: string }).message || t('customers.record.reminderFailed'));
    }
    // The next reminder in line takes the freed row.
    void refresh();
  };

  if (due && !due.allowed) return null;

  const head = due ? headline(due) : null;
  const book = due?.book;
  const discPunch = isDark ? '#1fc39c' : '#0f9a7c';
  const tileOnWell = over(c.tile, c.well);

  return (
    <View style={style}>
      <Well style={{ padding: amazen.space(4.5), paddingBottom: amazen.space(1.5) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Eyebrow tone="muted" style={{ flex: 1 }}>{t('widgets.clients', { defaultValue: 'Clients' })}</Eyebrow>
          {head && book != null ? (
            <Pressable onPress={openBook} hitSlop={10} accessibilityRole="button">
              <AText variant="caption" tone="muted">{t('clientsCard.allShort', { count: book })}</AText>
            </Pressable>
          ) : null}
        </View>

        {head ? (
          <View style={{ marginTop: amazen.space(2.5) }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
              <AText variant="display" tone="strong" numeric style={{ fontSize: 52, lineHeight: 56 }}>{String(due!.total)}</AText>
              <AText variant="body" tone="ink">{t(`${head.title.key}Label`, { count: due!.total })}</AText>
            </View>
            <Eyebrow tone="muted" numberOfLines={1} style={{ marginTop: 2 }}>
              {head.split.map(say).join(' · ')}
            </Eyebrow>
          </View>
        ) : due ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(3), paddingVertical: amazen.space(3) }}>
            <GlyphTile Glyph={FinishGlyph} color={c.accent} tint={c.accentTint} behind={c.well} size={34} glyphSize={18} />
            <AText variant="body" tone="strong">{t('clientsCard.nobody', { defaultValue: 'Nobody is waiting on you.' })}</AText>
          </View>
        ) : (
          /* Loading or offline: the shape holds, the doors below still work. */
          <View style={{ height: 70, marginTop: amazen.space(2.5), justifyContent: 'center' }}>
            <AText variant="caption" tone="muted">{failed ? t('clientsCard.offline', { defaultValue: 'Needs a connection to see what is due.' }) : ' '}</AText>
          </View>
        )}

        {due && due.items.length ? (
          <View style={{ marginTop: amazen.space(3) }}>
            {due.items.map((r, i) => {
              const l = rowLines(r);
              const late = daysLate(r.dueAt, day.current.start);
              const at = formatClock(r.dueAt);
              const midnight = r.dueAt ? new Date(r.dueAt).getHours() === 0 && new Date(r.dueAt).getMinutes() === 0 : true;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => openClient(r)}
                  accessibilityRole="button"
                  accessibilityLabel={`${say(l.title)}. ${say(l.reason)}`}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: amazen.space(2.5), paddingVertical: amazen.space(2.5),
                    borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.lineWell, opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <Monogram name={r.name} company={r.type === 'COMPANY'} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <AText variant="body" tone="strong" numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, lineHeight: 19 }}>{say(l.title)}</AText>
                      <AText variant="caption" numeric style={{ color: late ? c.warn : c.accent, fontSize: 11 }}>
                        {late ? t('clientsCard.late', { count: late }) : midnight ? t('clientsCard.today') : at}
                      </AText>
                    </View>
                    <AText variant="caption" numberOfLines={1} style={{ color: r.shared > 1 ? c.warn : c.inkMuted, marginTop: 1 }}>{say(l.reason)}</AText>
                  </View>
                  {r.kind !== 'OTHER' ? (
                    <Pressable
                      onPress={() => act(r)}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={say(l.title)}
                      style={({ pressed }) => ({
                        width: 36, height: 36, borderRadius: 18, backgroundColor: c.accentSolid,
                        alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1,
                      })}
                    >
                      {r.kind === 'CALL'
                        ? <CallGlyph size={18} color={c.accentInk} contrast={discPunch} />
                        : <EmailGlyph size={18} color={c.accentInk} contrast={discPunch} />}
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => void done(r)}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={t('clientsCard.markDone', { defaultValue: 'Mark done' })}
                    style={({ pressed }) => ({
                      width: 30, height: 30, borderRadius: 15, backgroundColor: tileOnWell, borderWidth: 1, borderColor: c.lineGlass,
                      alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <FinishGlyph size={15} color={c.ink} contrast={tileOnWell} />
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={{ gap: amazen.space(3), marginTop: amazen.space(1), paddingBottom: amazen.space(3) }}>
          {due && due.cold > 0 ? (
            <WellDoor
              onPress={openBook}
              lead={<GlyphTile Glyph={ColdGlyph} color={c.warn} tint={c.warnTint} behind={c.well} size={26} glyphSize={15} radius={8} />}
            >
              <AText variant="caption" numberOfLines={1} style={{ fontSize: 13.5 }}>
                <AText variant="caption" tone="strong" style={{ fontSize: 13.5, fontFamily: amazen.font.sansMedium }}>
                  {t('clientsCard.cold', { count: due.cold })}
                </AText>
                <AText variant="caption" tone="muted" style={{ fontSize: 13.5 }}>{' '}{t('clientsCard.coldWhy', { defaultValue: '— no contact in 30 days' })}</AText>
              </AText>
            </WellDoor>
          ) : null}
          {/* ⚠️ ALWAYS — and without a number when the number has not arrived. A door that waits for a number is not a door. */}
          <WellDoor
            onPress={openBook}
            title={book != null ? t('clientsCard.all', { count: book }) : t('clientsCard.allNoCount', { defaultValue: 'All clients' })}
          />
        </View>
      </Well>
    </View>
  );
}

/** A company is a rounded square, a person a circle — the same rule as `ClientAvatar` — with the kind as a badge. */
function Monogram({ name, company }: { name: string; company: boolean }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const badge = over(c.tile, c.well);
  return (
    <View style={{ width: 36, height: 36 }}>
      <View style={{ width: 36, height: 36, borderRadius: company ? 11 : 18, backgroundColor: c.tile, alignItems: 'center', justifyContent: 'center' }}>
        <AText variant="caption" tone="ink" style={{ fontSize: 11.5, fontFamily: amazen.font.sansMedium }}>{initials(name) || '·'}</AText>
      </View>
      <View style={{ position: 'absolute', right: -3, bottom: -3, width: 16, height: 16, borderRadius: 5, backgroundColor: badge, borderWidth: 2, borderColor: c.well, alignItems: 'center', justifyContent: 'center' }}>
        {company ? <ClientCompanyGlyph size={10} color={c.inkMuted} contrast={badge} /> : <ClientPersonGlyph size={10} color={c.inkMuted} />}
      </View>
    </View>
  );
}
