import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { useTimeFormat } from '@/hooks/use-time-format';
import { usePhrase } from './phrase';
import { daysLate, rowLines } from './clients-state';
import { ReminderRow } from './reminder-row';
import type { ClientsDueModel } from './use-clients-due';

/** The reminders owed today, one `ReminderRow` each — the home card and the client book draw the same list. */
export function ReminderList({ model }: { model: ClientsDueModel }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const { formatClock } = useTimeFormat();
  const say = usePhrase();
  if (!model.rowsShown.length) return null;
  return (
    <View style={{ marginTop: amazen.space(3) }}>
      {model.rowsShown.map((r, i) => {
        const l = rowLines(r);
        const late = daysLate(r.dueAt, model.dayStart);
        const midnight = r.dueAt ? new Date(r.dueAt).getHours() === 0 && new Date(r.dueAt).getMinutes() === 0 : true;
        return (
          <ReminderRow
            key={r.id}
            r={r}
            first={i === 0}
            state={model.stateOf(r.id)}
            title={say(l.title)}
            reason={say(l.reason)}
            due={late ? t('clientsCard.late', { count: late }) : midnight ? t('clientsCard.today') : formatClock(r.dueAt)}
            dueColor={late ? c.warn : c.accent}
            reasonColor={r.shared > 1 ? c.warn : c.inkMuted}
            onOpen={() => model.openClient(r.customerId)}
            onAct={() => model.act(r)}
            onDone={() => model.done(r)}
            onUndo={() => model.undo(r)}
            onGone={() => model.gone(r.id)}
          />
        );
      })}
    </View>
  );
}
