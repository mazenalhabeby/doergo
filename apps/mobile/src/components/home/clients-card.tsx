import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { AText, Eyebrow, CardSurface } from '../amazen';
import { usePhrase } from './phrase';
import { GlyphTile } from './glyph-tile';
import { WellDoor } from './well-door';
import { FinishGlyph } from '../glyphs/work-glyphs';
import { ColdGlyph } from '../glyphs/crm-glyphs';
import { headline } from './clients-state';
import { ReminderList } from './reminder-list';
import { useClientsDue } from './use-clients-due';
import { usePitch } from '../../home/pitch';

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

export function ClientsCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const router = useRouter();
  const model = useClientsDue(ROWS);
  const { due, shown, failed } = model;
  const say = usePhrase();
  const openBook = () => router.push('/(app)/customers' as Href);

  /*
    ⚠️ The pitch counts what is LEFT, not what the server last said: ticking a
    reminder off drops the card's count at once, and the line above the home
    must drop with it rather than trailing until the next refresh.
  */
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
            <AText variant="caption" tone="muted">
              {failed ? t('clientsCard.offline', { defaultValue: 'Needs a connection to see what is due.' }) : ' '}
            </AText>
          </View>
        )}

        <ReminderList model={model} />

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
                ? t(due.cold.longest.never ? 'clientsCard.coldNever' : 'clientsCard.coldLongest', {
                    name: due.cold.longest.name,
                    count: due.cold.longest.days,
                  })
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
