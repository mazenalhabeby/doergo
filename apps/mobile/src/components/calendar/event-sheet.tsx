import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useToast } from '../../island/island-context';
import { AText, PrimaryButton, Sunken, QuietButton, SectionLabel } from '../amazen';
import { JobSheet } from '../job/job-ui';
import { MEETING_PROVIDER_NAMES, meetingProvider } from '@hbcfield/shared/client';
import { calendarApi, type CalendarEventDetail } from '../../lib/api';
import { calendarError } from './errors';
import { httpsUrl, openSafeUrl, telUrl } from '../../lib/safe-links';

const RSVP = [
  { v: 'ACCEPTED' as const, key: 'calendar.rsvp.accept' },
  { v: 'MAYBE' as const, key: 'calendar.rsvp.maybe' },
  { v: 'DECLINED' as const, key: 'calendar.rsvp.decline' },
];

/**
 * One event, opened: when, where, who is coming — and the member's own answer. A reminder carries
 * Done and +10 min; an appointment with a link carries Join. Only https links are opened.
 */
export function EventSheet({ eventId, onClose, onChanged }: { eventId: string | null; onClose: () => void; onChanged: () => void }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [ev, setEv] = useState<CalendarEventDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    setEv(null);
    setGone(false);
    if (!eventId) return;
    let live = true;
    calendarApi.event(eventId).then((e) => { if (live) setEv(e); }).catch(() => { if (live) setGone(true); });
    return () => { live = false; };
  }, [eventId]);

  const act = async (fn: () => Promise<unknown>, done?: string, close = false) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (done) toast.success(done);
      onChanged();
      if (close) onClose();
      else if (eventId) setEv(await calendarApi.event(eventId));
    } catch (e) {
      toast.error(t('common.error', 'Error'), calendarError(e, t));
    } finally {
      setBusy(false);
    }
  };

  const s = ev ? new Date(ev.startAt) : null;
  const e = ev ? new Date(ev.endAt) : null;
  const when = s && e
    ? ev!.allDay
      ? s.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })
      : (`${s.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })} · ` + `${s.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}–${e.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}`)
    : '';
  const going = ev?.attendees.filter((a) => a.response === 'ACCEPTED').length ?? 0;
  const safeLink = httpsUrl(ev?.meetingUrl, false);

  return (
    <JobSheet
      visible={!!eventId}
      onClose={onClose}
      busy={busy}
      title={ev?.title ?? (gone ? t('calendar.gone', 'This is no longer in your calendar') : ' ')}
      eyebrow={
        ev ? (
          <AText variant="caption" tone="accent" style={{ fontSize: 11, letterSpacing: 0.6 }}>
            {t(ev.kind === 'REMINDER' ? 'calendar.reminder' : 'calendar.appointment').toUpperCase()}
          </AText>
        ) : undefined
      }
    >
      {ev ? (
        <>
          <Sunken style={{ padding: amazen.space(3.5), gap: amazen.space(2) }}>
            <Row label={t('calendar.when', 'When')} value={when} />
            {ev.meetingMode === 'IN_PERSON' && ev.placeKind === 'OFFICE' && ev.placeSpace ? (
              <Row
                label={t('calendar.place.OFFICE', 'Our office')}
                value={[ev.placeSpace.name, ev.room].filter(Boolean).join(' · ')}
              />
            ) : null}
            {ev.location && ev.meetingMode !== 'PHONE' ? <Row label={t('calendar.where', 'Where')} value={ev.location} /> : null}
            {ev.meetingMode === 'ONLINE' && meetingProvider(ev.meetingUrl) ? (
              <Row
                label={t('calendar.mode.ONLINE', 'Online')}
                value={MEETING_PROVIDER_NAMES[meetingProvider(ev.meetingUrl)!]}
              />
            ) : null}
            {ev.meetingMode === 'PHONE' && ev.phone ? (
              <Row
                label={t('calendar.mode.PHONE', 'Phone')}
                value={`${ev.phone} · ${t(`calendar.call.${ev.callDirection ?? 'OUTGOING'}`)}`}
              />
            ) : null}
            {ev.customer ? <Row label={t('calendar.client', 'Client')} value={ev.customer.name} /> : null}
            {ev.reminders.length ? (
              <Row
                label={t('calendar.remind', 'Remind')}
                value={ev.reminders.map((m) => offsetText(m, t)).join(', ')}
              />
            ) : null}
            {ev.attendees.length > 1 ? (
              <Row
                label={t('calendar.people', 'People')}
                value={t('calendar.going', { count: going, total: ev.attendees.length })}
              />
            ) : null}
          </Sunken>

          {ev.attendees.length > 1 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {ev.attendees.map((a) => {
                const tone =
                  a.response === 'ACCEPTED'
                    ? c.accent
                    : a.response === 'DECLINED'
                      ? c.critical
                      : a.response === 'MAYBE'
                        ? c.warn
                        : c.inkMuted;
                return (
                  <View
                    key={a.userId}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      backgroundColor: c.tile,
                    }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone }} />
                    <AText variant="caption" tone="ink" style={{ fontSize: 12 }}>
                      {a.firstName}
                      {a.isOrganizer ? ` · ${t('calendar.organizer', 'organizer')}` : ''}
                    </AText>
                  </View>
                );
              })}
            </View>
          ) : null}

          {ev.description ? <AText variant="body" tone="ink" style={{ fontSize: 14, lineHeight: 20 }}>{ev.description}</AText> : null}

          {safeLink ? <PrimaryButton label={t('calendar.join', 'Join')} onPress={() => void openSafeUrl(safeLink)} /> : null}
          {ev.meetingMode === 'PHONE' && telUrl(ev.phone) ? (
            <PrimaryButton label={t('calendar.callNow', 'Call')} onPress={() => void openSafeUrl(telUrl(ev.phone))} />
          ) : null}
          {ev.meetingMode === 'IN_PERSON' && ev.location ? (
            <QuietButton
              label={t('calendar.directions', 'Directions')}
              tone="accent"
              onPress={() =>
                void openSafeUrl(
                  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ev.location!)}`,
                )
              }
            />
          ) : null}

          {!ev.canEdit ? (
            <View style={{ gap: amazen.space(1.5) }}>
              <SectionLabel>{t('calendar.yourAnswer', 'Your answer')}</SectionLabel>
              <View style={{ flexDirection: 'row', gap: amazen.space(1.5) }}>
                {RSVP.map(({ v, key }) => {
                  const on = ev.myResponse === v;
                  return (
                    <Pressable
                      key={v}
                      disabled={busy}
                      onPress={() => void act(() => calendarApi.respond(ev.id, v), t('calendar.answered', 'Answer sent'))}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={({ pressed }) => ({
                        flex: 1,
                        alignItems: 'center',
                        paddingVertical: amazen.space(2.75),
                        borderRadius: 16,
                        backgroundColor: on ? c.accentTint : c.tile,
                        borderWidth: 1,
                        borderColor: on ? c.accent : 'transparent',
                        opacity: pressed ? 0.8 : 1,
                      })}
                    >
                      <AText variant="caption" style={{ fontSize: 13, color: on ? c.accent : c.inkStrong }}>{t(key)}</AText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: amazen.space(2) }}>
            {ev.reminders.length > 0 ? (
              <>
                <View style={{ flex: 1 }}>
                  <QuietButton
                    label={t('calendar.snooze', '+10 min')}
                    onPress={() =>
                      void act(
                        () => calendarApi.snooze(ev.id, 10),
                        t('calendar.snoozed', 'Reminding you again in 10 minutes'),
                      )
                    }
                    disabled={busy}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <QuietButton
                    label={t('calendar.done', 'Done')}
                    tone="accent"
                    onPress={() => void act(() => calendarApi.done(ev.id), undefined, true)}
                    disabled={busy}
                  />
                </View>
              </>
            ) : null}
          </View>
          {ev.canEdit ? (
            <QuietButton
              label={t('calendar.cancelEvent', 'Cancel it')}
              tone="critical"
              onPress={() => void act(() => calendarApi.cancel(ev.id), t('calendar.canceledToast', 'Canceled'), true)}
              disabled={busy}
            />
          ) : null}
        </>
      ) : !gone ? (
        <View style={{ height: 160 }} />
      ) : null}
    </JobSheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <AText variant="caption" tone="muted" style={{ width: 70, fontSize: 12.5 }}>{label}</AText>
      <AText variant="caption" tone="strong" style={{ flex: 1, fontSize: 13.5 }}>{value}</AText>
    </View>
  );
}

export function offsetText(m: number, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (m === 0) return t('calendar.atStart', { defaultValue: 'At the start' });
  if (m < 60) return t('calendar.minutes', { count: m });
  if (m < 1440) return t('calendar.hours', { count: m / 60 });
  if (m < 10080) return t('calendar.days', { count: m / 1440 });
  return t('calendar.weeks', { count: m / 10080 });
}
