import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { AText, Eyebrow, Well } from '@/components/amazen';
import { usePhrase } from '../home/phrase';
import { headline } from '../home/clients-state';
import { ReminderList } from '../home/reminder-list';
import { useClientsDue } from '../home/use-clients-due';
import { WellDoor } from '../home/well-door';
import { GlyphTile } from '../home/glyph-tile';
import { ColdGlyph } from '@/components/glyphs/crm-glyphs';

const ROWS = 5;

/**
 * The top of the client book: what is owed today, and who is going cold.
 *
 * The same read, the same rows and the same tick-with-undo as the home Clients
 * card (`useClientsDue`) — a reminder done here is done there. Drawn only when
 * there is something in it: on a quiet day the book simply starts at the top.
 * Going cold opens the client who has waited longest — the book is already here.
 */
export function ClientsToday() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const say = usePhrase();
  const model = useClientsDue(ROWS);
  const { due, shown } = model;
  if (!due || !shown || !due.allowed) return null;
  const head = headline(shown);
  const cold = due.cold;
  if (!head && !cold.count) return null;

  return (
    <Well style={{ paddingHorizontal: amazen.space(3.5), paddingTop: amazen.space(3.5), paddingBottom: amazen.space(2) }}>
      {head ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <AText variant="display" tone="strong" numeric style={{ fontSize: 32, lineHeight: 36 }}>{String(shown.total)}</AText>
            <AText variant="body" tone="ink">{t(head.title.key, { count: shown.total })}</AText>
          </View>
          <Eyebrow tone="muted" numberOfLines={1} style={{ marginTop: 2 }}>{head.split.map(say).join(' · ')}</Eyebrow>
          <ReminderList model={model} />
        </>
      ) : null}
      {cold.count > 0 ? (
        <View>
          <WellDoor
            onPress={() => { if (cold.longest) model.openClient(cold.longest.id); }}
            lead={<GlyphTile Glyph={ColdGlyph} color={c.warn} tint={c.warnTint} behind={c.well} size={26} glyphSize={15} radius={8} />}
            title={t('clientsCard.cold', { count: cold.count })}
            detail={cold.longest
              ? t(cold.longest.never ? 'clientsCard.coldNever' : 'clientsCard.coldLongest', {
                  name: cold.longest.name,
                  count: cold.longest.days,
                })
              : t('clientsCard.coldRule', { count: cold.days })}
          />
        </View>
      ) : null}
    </Well>
  );
}
