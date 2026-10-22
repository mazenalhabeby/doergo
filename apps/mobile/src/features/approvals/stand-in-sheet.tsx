import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DELEGATION_MAX_DAYS, type StandInView, type StandInsResponse } from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { approvalsApi } from '../../lib/api';
import { formatDay } from '../../lib/money';
import { dayKeyOf } from '../../lib/log-dates';
import { AText, GhostButton, GlassInput, PrimaryButton, SectionLabel, SheetOption } from '../../components/amazen';
import { DateField } from '../../components/date-field';
import { JobSheet } from '../job/job-ui';
import { caught } from '../../lib/caught';

/**
 * Stand-ins on the phone: hand your approvals to a colleague for some days,
 * see who covers whom, end one. Online. What a stand-in may then decide is
 * the server's (shared `access/delegation.ts`).
 */
export function StandInSheet({
  visible,
  onClose,
  onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const today = dayKeyOf(new Date());

  const [data, setData] = useState<StandInsResponse | null>(null);
  const [toUserId, setTo] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [startsOn, setStart] = useState(today);
  const [endsOn, setEnd] = useState(today);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    approvalsApi
      .standIns()
      .then(setData)
      .catch(() => setData(null));
  }, []);
  useEffect(() => {
    if (!visible) return;
    setData(null);
    setTo(null);
    setPicking(false);
    setStart(today);
    setEnd(today);
    setNote('');
    load();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const day = (k: string) => formatDay(`${k}T12:00:00Z`, i18n.language);
  const chosen = data?.candidates.find((p) => p.id === toUserId) ?? null;

  const save = async () => {
    if (!toUserId) return;
    setBusy(true);
    try {
      const v = await approvalsApi.createStandIn({ toUserId, startsOn, endsOn, note: note.trim() || null });
      toast.success(t('approvals.standIn.created', { name: v.to.name, from: day(v.startsOn), to: day(v.endsOn) }));
      setTo(null);
      setNote('');
      load();
      onChanged();
    } catch (e: unknown) {
      toast.error(caught(e).message || t('approvals.loadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const end = async (id: string) => {
    setBusy(true);
    try {
      await approvalsApi.endStandIn(id);
      toast.success(t('approvals.standIn.ended'));
      load();
      onChanged();
    } catch (e: unknown) {
      toast.error(caught(e).message || t('approvals.loadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const list = (title: string, rows: StandInView[], show: 'to' | 'from' | 'both') =>
    rows.length ? (
      <View style={{ gap: amazen.space(1.5) }}>
        <SectionLabel>{title}</SectionLabel>
        {rows.map((r) => (
          <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AText variant="body" tone="strong" numberOfLines={1} style={{ fontSize: 14 }}>
                {show === 'to' ? r.to.name : show === 'from' ? r.from.name : `${r.from.name} → ${r.to.name}`}
              </AText>
              <AText variant="caption" tone="muted" numberOfLines={2}>
                {`${r.active ? `${t('approvals.standIn.now')} · ` : ''}` +
                  `${t('approvals.standIn.from', { from: day(r.startsOn), to: day(r.endsOn) })}`}
              </AText>
            </View>
            {r.canEnd ? (
              <GhostButton label={t('approvals.standIn.end')} disabled={busy} onPress={() => void end(r.id)} />
            ) : null}
          </View>
        ))}
      </View>
    ) : null;

  return (
    <JobSheet visible={visible} onClose={onClose} busy={busy} title={t('approvals.standIn.title')}>
      <AText variant="caption" tone="muted">
        {t('approvals.standIn.intro')}
      </AText>
      {!data ? (
        <ActivityIndicator color={c.accent} />
      ) : (
        <>
          {data.mayHandOver ? (
            picking ? (
              <>
                <SectionLabel>{t('approvals.standIn.who')}</SectionLabel>
                {data.candidates.map((p) => (
                  <SheetOption
                    key={p.id}
                    label={p.name}
                    tone={toUserId === p.id ? 'accent' : 'strong'}
                    onPress={() => {
                      setTo(p.id);
                      setPicking(false);
                    }}
                  />
                ))}
              </>
            ) : (
              <>
                <SectionLabel>{t('approvals.standIn.who')}</SectionLabel>
                <SheetOption
                  label={chosen?.name ?? t('approvals.standIn.pickPerson')}
                  tone={chosen ? 'accent' : 'strong'}
                  onPress={() => setPicking(true)}
                />
                <SectionLabel>{t('approvals.standIn.firstDay')}</SectionLabel>
                <DateField
                  value={startsOn}
                  onChange={(k) => {
                    setStart(k);
                    if (endsOn < k) setEnd(k);
                  }}
                  minDate={new Date()}
                  title={t('approvals.standIn.firstDay')}
                />
                <SectionLabel>{t('approvals.standIn.lastDay')}</SectionLabel>
                <DateField
                  value={endsOn}
                  onChange={setEnd}
                  minDate={new Date(`${startsOn}T12:00:00`)}
                  title={t('approvals.standIn.lastDay')}
                />
                <AText variant="caption" tone="muted">
                  {t('approvals.standIn.maxDays', { count: DELEGATION_MAX_DAYS })}
                </AText>
                <SectionLabel>{t('approvals.standIn.note')}</SectionLabel>
                <GlassInput value={note} onChangeText={setNote} maxLength={300} />
                <PrimaryButton
                  label={t('approvals.standIn.save')}
                  loading={busy}
                  disabled={busy || !toUserId || endsOn < startsOn}
                  onPress={() => void save()}
                />
              </>
            )
          ) : (
            <AText variant="caption" tone="onGlass">
              {t('approvals.standIn.nothing')}
            </AText>
          )}
          {list(t('approvals.standIn.yours'), data.given, 'to')}
          {list(t('approvals.standIn.forYou'), data.received, 'from')}
          {list(t('approvals.standIn.others'), data.others, 'both')}
        </>
      )}
    </JobSheet>
  );
}
