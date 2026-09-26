import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { customersApi, type ClientsDue, type DueReminder } from '../../lib/api/customers';
import { useQueuedWrite } from '../../offline/actions/queued-write';
import { setActivityDoneFromPhone } from '../../offline/crm/client-actions';
import { useToast } from '../../island/island-context';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { AText, Eyebrow, CardSurface } from '../amazen';
import { useLiveRefresh } from '../../hooks/use-live-refresh';
import { usePhrase } from './phrase';
import { GlyphTile } from './glyph-tile';
import { WellDoor } from './well-door';
import { FinishGlyph } from '../glyphs/work-glyphs';
import { ColdGlyph } from '../glyphs/crm-glyphs';
import { daysLate, headline, localDay, rowLines, withoutDone } from './clients-state';
import { ReminderRow, UNDO_MS, type RowState } from './reminder-row';
import { usePitch } from '../../home/pitch';
import { impact, selection } from '../../lib/haptics';

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
  const { amazen } = useTheme();
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

  /*
    ⭐ DONE, WITH A WAY BACK. The ring closes at once and the count drops, but
    nothing is sent for UNDO_MS: a reminder ticked off by mistake would
    otherwise be gone from the card with no way to find it again. Then it is
    sent through the queue (still works with no signal) and the row folds away.
  */
  const [marked, setMarked] = useState<Record<string, { r: DueReminder; state: RowState | 'gone' }>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const send = useCallback(async (r: DueReminder) => {
    const outcome = await write.run(
      (e) => setActivityDoneFromPhone(e, { customerId: r.customerId, activityId: r.id, done: true }),
      () => customersApi.updateActivity(r.customerId, r.id, { done: true }),
    );
    if (outcome.kind === 'refused') {
      toast.error((outcome as { message?: string }).message || t('customers.record.reminderFailed'));
      if (live.current) setMarked((m) => { const { [r.id]: _, ...rest } = m; return rest; });
    }
    // The next reminder in line takes the freed row.
    if (live.current) void refresh();
  }, [write, toast, t, refresh]);

  const done = (r: DueReminder) => {
    impact('light');
    setMarked((m) => ({ ...m, [r.id]: { r, state: 'undo' } }));
    timers.current[r.id] = setTimeout(() => {
      delete timers.current[r.id];
      setMarked((m) => (m[r.id] ? { ...m, [r.id]: { r, state: 'leaving' } } : m));
      void send(r);
    }, UNDO_MS);
  };
  const undo = (r: DueReminder) => {
    clearTimeout(timers.current[r.id]);
    delete timers.current[r.id];
    selection();
    setMarked((m) => { const { [r.id]: _, ...rest } = m; return rest; });
  };
  const gone = useCallback((id: string) => setMarked((m) => (m[id] ? { ...m, [id]: { ...m[id]!, state: 'gone' } } : m)), []);

  /* Leaving the screen inside the undo window is not an undo: send what was ticked. */
  const pending = useRef(marked);
  pending.current = marked;
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => () => {
    for (const [id, tm] of Object.entries(timers.current)) {
      clearTimeout(tm);
      const e = pending.current[id];
      if (e) void sendRef.current(e.r);
    }
  }, []);

  /*
    ⚠️ The pitch counts what is LEFT, not what the server last said: ticking a
    reminder off drops the card's count at once, and the line above the home
    must drop with it rather than trailing until the next refresh.
  */
  const shown = due ? withoutDone(due, Object.values(marked).map((x) => x.r), day.current.start) : null;
  usePitch(!shown || !shown.allowed ? null : shown.total
    ? { need: shown.total, line: t('pitch.clients', { count: shown.total }) }
    : { need: 0, line: t('pitch.clientsCalm') });

  if (due && !due.allowed) return null;

  const head = shown ? headline(shown) : null;
  const book = due?.book;

  return (
    <View style={style}>
      <CardSurface style={{ padding: amazen.space(4.5), paddingBottom: amazen.space(1.5) }}>
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
              <AText variant="display" tone="strong" numeric style={{ fontSize: 52, lineHeight: 56 }}>{String(shown!.total)}</AText>
              <AText variant="body" tone="ink">{t(head.title.key, { count: shown!.total })}</AText>
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
            {due.items.filter((r) => marked[r.id]?.state !== 'gone').map((r, i) => {
              const l = rowLines(r);
              const late = daysLate(r.dueAt, day.current.start);
              const midnight = r.dueAt ? new Date(r.dueAt).getHours() === 0 && new Date(r.dueAt).getMinutes() === 0 : true;
              const state = marked[r.id]?.state;
              return (
                <ReminderRow
                  key={r.id}
                  r={r}
                  first={i === 0}
                  state={state && state !== 'gone' ? state : 'open'}
                  title={say(l.title)}
                  reason={say(l.reason)}
                  due={late ? t('clientsCard.late', { count: late }) : midnight ? t('clientsCard.today') : formatClock(r.dueAt)}
                  dueColor={late ? c.warn : c.accent}
                  reasonColor={r.shared > 1 ? c.warn : c.inkMuted}
                  onOpen={() => openClient(r)}
                  onAct={() => act(r)}
                  onDone={() => done(r)}
                  onUndo={() => undo(r)}
                  onGone={() => gone(r.id)}
                />
              );
            })}
          </View>
        ) : null}

        <View style={{ gap: amazen.space(3), marginTop: amazen.space(1), paddingBottom: amazen.space(3) }}>
          {due && due.cold.count > 0 ? (
            /*
              ⚠️ NOTHING HERE IS A SENTENCE OF THE CARD'S OWN. The count, the
              rule (days without contact) and the client who has waited
              longest all come with the answer; the card only arranges them.
            */
            <WellDoor
              onPress={openBook}
              lead={<GlyphTile Glyph={ColdGlyph} color={c.warn} tint={c.warnTint} behind={c.well} size={26} glyphSize={15} radius={8} />}
              title={t('clientsCard.cold', { count: due.cold.count })}
              detail={due.cold.longest
                ? t(due.cold.longest.never ? 'clientsCard.coldNever' : 'clientsCard.coldLongest', { name: due.cold.longest.name, count: due.cold.longest.days })
                : t('clientsCard.coldRule', { count: due.cold.days })}
            />
          ) : null}
          {/* ⚠️ ALWAYS — and without a number when the number has not arrived. A door that waits for a number is not a door. */}
          <WellDoor
            onPress={openBook}
            title={book != null ? t('clientsCard.all', { count: book }) : t('clientsCard.allNoCount', { defaultValue: 'All clients' })}
          />
        </View>
      </CardSurface>
    </View>
  );
}
