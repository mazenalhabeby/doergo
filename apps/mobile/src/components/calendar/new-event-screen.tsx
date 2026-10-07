import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  MEETING_PROVIDER_NAMES, cleanPhone, meetingProvider, moduleAnywhere, parseQuickAdd,
  type CallDirection, type MeetingMode, type PlaceKind,
} from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { useToast } from '../../island/island-context';
import { AText, FilterPill, FilterRow, Ground, PrimaryButton, Well } from '../amazen';
import { JobField, SectionLabel } from '../job/job-ui';
import { DaySheet, TimeSheet } from '../new-job/when-sheets';
import { calendarApi, customersApi, locationsApi, type CalendarPerson, type MobileCustomer } from '../../lib/api';
import { crmCapsOf } from '../../lib/member-reach';
import { tabAccessFor } from '../../lib/tab-layout';
import { dayKey, forgetCalendarPages } from './calendar-data';
import { calendarError } from './errors';
import { offsetText } from './event-sheet';

const DURATIONS = [15, 30, 60, 90, 120];
const REMIND = [0, 10, 30, 60, 1440];
type Kind = 'APPOINTMENT' | 'REMINDER';

/**
 * NEW — one button, four kinds. An appointment says HOW (in person at our office / the client's
 * site / an address · online with a link · by phone) and only that mode's fields are shown;
 * the server keeps exactly those (shared meetingFieldsFor). Job and Time off are not re-built
 * here — they open the existing screens, filled with this moment, and only for somebody the
 * server would let use them.
 *
 * Route params: `day` (YYYY-MM-DD), `hour` (0–23), `spaceId` (the workspace on screen).
 */
export function NewEventScreen() {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const p = useLocalSearchParams<{ day?: string; hour?: string; spaceId?: string }>();
  const access = tabAccessFor(user as never);
  const crm = !!user && moduleAnywhere(user as never, 'crm') && crmCapsOf(user as never).canAccess;

  const startDay = typeof p.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.day) ? p.day : dayKey(new Date());
  const startHour = typeof p.hour === 'string' && /^\d{1,2}$/.test(p.hour) ? Number(p.hour) : null;

  const [kind, setKind] = useState<Kind>('APPOINTMENT');
  const [smart, setSmart] = useState('');
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(startDay);
  const [time, setTime] = useState(startHour != null ? `${String(startHour).padStart(2, '0')}:00` : '');
  const [duration, setDuration] = useState(60);
  const [mode, setMode] = useState<MeetingMode>('IN_PERSON');
  const [place, setPlace] = useState<PlaceKind>('OFFICE');
  const [offices, setOffices] = useState<{ id: string; name: string }[]>([]);
  const [officeId, setOfficeId] = useState<string>('');
  const [room, setRoom] = useState('');
  const [location, setLocation] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [phone, setPhone] = useState('');
  const [callDirection, setCallDirection] = useState<CallDirection>('OUTGOING');
  const [client, setClient] = useState<MobileCustomer | null>(null);
  const [clientQ, setClientQ] = useState('');
  const [clients, setClients] = useState<MobileCustomer[]>([]);
  const [addresses, setAddresses] = useState<{ id: string; label: string; address: string }[]>([]);
  const [people, setPeople] = useState<CalendarPerson[]>([]);
  const [peopleQ, setPeopleQ] = useState('');
  const [found, setFound] = useState<CalendarPerson[]>([]);
  const [reminders, setReminders] = useState<number[]>([10]);
  const [sheet, setSheet] = useState<'day' | 'time' | null>(null);
  const [busy, setBusy] = useState(false);

  // Our offices: the workspaces this member can see (the server re-checks they work there).
  useEffect(() => {
    locationsApi.list().then((list) => {
      const opts = list.filter((l) => !(l as { isRemote?: boolean }).isRemote).map((l) => ({ id: l.id, name: l.name }));
      setOffices(opts);
      const pick = opts.find((o) => o.id === p.spaceId) ?? opts[0];
      if (pick) setOfficeId(pick.id); else setPlace('ADDRESS');
    }).catch(() => setPlace('ADDRESS'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The sentence fills the fields as it is typed; every field stays editable.
  const parsed = useMemo(() => {
    if (!smart.trim()) return null;
    const now = new Date();
    return parseQuickAdd(smart, dayKey(now), now.getHours() * 60 + now.getMinutes());
  }, [smart]);
  useEffect(() => {
    if (!parsed) return;
    setKind(parsed.kind);
    if (parsed.title) setTitle(parsed.title);
    if (parsed.date) setDay(parsed.date);
    if (parsed.time) setTime(parsed.time);
    if (parsed.durationMin) setDuration(parsed.durationMin);
  }, [parsed]);

  useEffect(() => {
    if (!crm || !clientQ.trim()) { setClients([]); return; }
    let live = true;
    const id = setTimeout(() => customersApi.list({ search: clientQ.trim(), limit: 8 }).then((r) => { if (live) setClients(r); }).catch(() => undefined), 220);
    return () => { live = false; clearTimeout(id); };
  }, [clientQ, crm]);

  // Where the client is: the record's own address, then its address rows (same rule as the web).
  useEffect(() => {
    if (!client) { setAddresses([]); return; }
    let live = true;
    customersApi.addresses(client.id).then((rows) => {
      if (!live) return;
      const out: { id: string; label: string; address: string }[] = [];
      if (client.address) out.push({ id: 'client', label: client.address, address: client.address });
      for (const a of rows) if (a.address) out.push({ id: a.id, label: a.label || a.address, address: a.address });
      setAddresses(out);
      if (place === 'CLIENT_SITE' && !location && out.length === 1) setLocation(out[0]!.address);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [client?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!peopleQ.trim()) { setFound([]); return; }
    let live = true;
    const id = setTimeout(() => calendarApi.people(peopleQ.trim()).then((r) => { if (live) setFound(r); }).catch(() => undefined), 220);
    return () => { live = false; clearTimeout(id); };
  }, [peopleQ]);

  const provider = meetingProvider(meetingUrl.trim());
  const phoneOk = !phone.trim() || !!cleanPhone(phone);
  const start = time ? new Date(`${day}T${time}:00`) : null;
  const end = start ? new Date(start.getTime() + duration * 60000) : null;
  const dayLabel = new Date(`${day}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  const canSave = !!title.trim() && !busy && phoneOk && !(kind === 'APPOINTMENT' && mode === 'IN_PERSON' && place === 'CLIENT_SITE' && (!client || !location.trim()));

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await calendarApi.create({
        kind, title: title.trim(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...(start && end ? { startAt: start.toISOString(), endAt: end.toISOString() } : { allDay: true, startDate: day, endDate: day }),
        reminders, attendeeIds: people.map((x) => x.id),
        ...(crm ? { customerId: client?.id ?? null } : {}),
        ...(kind === 'APPOINTMENT' ? {
          meetingMode: mode, placeKind: mode === 'IN_PERSON' ? place : null, placeSpaceId: place === 'OFFICE' ? officeId || null : null,
          room: room.trim() || null, location: location.trim() || null, meetingUrl: meetingUrl.trim() || null,
          phone: phone.trim() || null, callDirection,
        } : {}),
      });
      forgetCalendarPages();
      toast.success(people.length ? t('calendar.invitedToast', { count: people.length }) : t('calendar.createdToast', 'Added to your calendar'));
      router.back();
    } catch (e) {
      toast.error(t('common.error', 'Error'), calendarError(e, t));
    } finally {
      setBusy(false);
    }
  };

  const openJob = () => router.replace({ pathname: '/(app)/(tabs)/create-task', params: { due: (start ?? new Date(`${day}T00:00:00`)).toISOString() } } as never);
  const openTimeOff = () => router.replace({ pathname: '/(app)/(tabs)/time-off', params: { from: day } } as never);

  const pill = (label: string, on: boolean, onPress: () => void) => <FilterPill key={label} label={label} on={on} onPress={onPress} />;

  return (
    <Ground style={{ flex: 1 }}>
      <View style={{ paddingTop: 54, paddingHorizontal: amazen.space(4), paddingBottom: amazen.space(2.5), flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: c.lineWell }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={10}><AText variant="body" tone="ink">{t('common.cancel', 'Cancel')}</AText></Pressable>
        <AText variant="body" tone="strong" style={{ flex: 1, textAlign: 'center', fontSize: 16 }}>{t('calendar.new', 'New')}</AText>
        <Pressable onPress={save} disabled={!canSave} accessibilityRole="button" hitSlop={10} style={{ opacity: canSave ? 1 : 0.4 }}>
          <AText variant="body" tone="accent" style={{ fontWeight: '600' }}>{people.length ? t('calendar.saveAndInvite', 'Save and invite') : t('calendar.save', 'Save')}</AText>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: amazen.space(4), gap: amazen.space(3.5), paddingBottom: 80 }}>
          <FilterRow>
            {pill(t('calendar.appointment', 'Appointment'), kind === 'APPOINTMENT', () => setKind('APPOINTMENT'))}
            {pill(t('calendar.reminder', 'Reminder'), kind === 'REMINDER', () => setKind('REMINDER'))}
            {access.timeOff ? pill(t('calendar.kindTimeOff', 'Time off'), false, openTimeOff) : null}
            {access.create ? pill(t('calendar.kindJob', 'Job'), false, openJob) : null}
          </FilterRow>

          <View style={{ gap: amazen.space(1.5) }}>
            <JobField value={smart} onChangeText={setSmart} placeholder={t('calendar.smartPlaceholder', 'Say it: “Visit BILLA Friday 9:00”')} autoFocus />
            {parsed && parsed.parts.length ? (
              <AText variant="caption" tone="muted" style={{ fontSize: 12 }}>{t('calendar.readAs', 'Read as')} {parsed.parts.map((x) => x.text).join(' · ')}</AText>
            ) : null}
          </View>

          <View style={{ gap: amazen.space(1.5) }}>
            <SectionLabel>{t('calendar.titleLabel', 'Title')}</SectionLabel>
            <JobField value={title} onChangeText={setTitle} maxLength={140} placeholder={t('calendar.titlePlaceholder', 'What is it?')} />
          </View>

          <View style={{ gap: amazen.space(1.5) }}>
            <SectionLabel>{t('calendar.when', 'When')}</SectionLabel>
            <FilterRow>
              {pill(dayLabel, true, () => setSheet('day'))}
              {pill(time || t('calendar.allDay', 'All day'), !!time, () => setSheet('time'))}
              {time ? DURATIONS.map((m) => pill(offsetText(m, t), duration === m, () => setDuration(m))) : null}
            </FilterRow>
          </View>

          {kind === 'APPOINTMENT' ? (
            <View style={{ gap: amazen.space(2) }}>
              <SectionLabel>{t('calendar.how', 'How')}</SectionLabel>
              <FilterRow>
                {(['IN_PERSON', 'ONLINE', 'PHONE'] as const).map((m) => pill(t(`calendar.mode.${m}`), mode === m, () => setMode(m)))}
              </FilterRow>

              {mode === 'IN_PERSON' ? (
                <Well style={{ padding: amazen.space(3), gap: amazen.space(2.5) }}>
                  <FilterRow>
                    {(['OFFICE', 'CLIENT_SITE', 'ADDRESS'] as const)
                      .filter((k) => (k !== 'OFFICE' || offices.length > 0) && (k !== 'CLIENT_SITE' || crm))
                      .map((k) => pill(t(`calendar.place.${k}`), place === k, () => { if (k !== place) setLocation(''); setPlace(k); }))}
                  </FilterRow>
                  {place === 'OFFICE' ? (
                    <>
                      <FilterRow>{offices.map((o) => pill(o.name, officeId === o.id, () => setOfficeId(o.id)))}</FilterRow>
                      <JobField value={room} onChangeText={setRoom} maxLength={80} placeholder={t('calendar.roomPlaceholder', 'Room (optional)')} />
                      <AText variant="caption" tone="muted" style={{ fontSize: 12 }}>{t('calendar.officeAddressAuto', "The office's address is added for everyone automatically.")}</AText>
                    </>
                  ) : null}
                  {place === 'CLIENT_SITE' ? (
                    !client ? <AText variant="caption" tone="warn" style={{ fontSize: 12 }}>{t('calendar.pickClientFirst', 'Choose the client below first.')}</AText>
                    : addresses.length ? (
                      <View style={{ gap: 6 }}>
                        <AText variant="caption" tone="muted" style={{ fontSize: 12 }}>{t('calendar.whichAddress', 'Which address')}</AText>
                        {addresses.map((a) => (
                          <Pressable key={a.id} onPress={() => setLocation(a.address)} accessibilityRole="radio" accessibilityState={{ selected: location === a.address }}
                            style={{ borderRadius: 12, padding: amazen.space(2.5), borderWidth: 1.5, borderColor: location === a.address ? c.accent : c.lineWell, backgroundColor: location === a.address ? c.accentTint : 'transparent' }}>
                            <AText variant="body" tone="strong" style={{ fontSize: 13.5 }} numberOfLines={1}>{a.label}</AText>
                            {a.label !== a.address ? <AText variant="caption" tone="muted" numberOfLines={1} style={{ fontSize: 12 }}>{a.address}</AText> : null}
                          </Pressable>
                        ))}
                      </View>
                    ) : <JobField value={location} onChangeText={setLocation} maxLength={200} placeholder={t('calendar.addressPlaceholder', 'Street, town')} />
                  ) : null}
                  {place === 'ADDRESS' ? <JobField value={location} onChangeText={setLocation} maxLength={200} placeholder={t('calendar.addressPlaceholder', 'Street, town')} /> : null}
                </Well>
              ) : null}

              {mode === 'ONLINE' ? (
                <Well style={{ padding: amazen.space(3), gap: amazen.space(2) }}>
                  <JobField value={meetingUrl} onChangeText={setMeetingUrl} autoCapitalize="none" keyboardType="url" placeholder="https://teams.microsoft.com/…" />
                  {provider ? <AText variant="caption" tone="accent" style={{ fontSize: 12 }}>{t('calendar.linkRecognised', { defaultValue: '{{name}} — a Join button appears in the calendar', name: MEETING_PROVIDER_NAMES[provider] })}</AText> : null}
                </Well>
              ) : null}

              {mode === 'PHONE' ? (
                <Well style={{ padding: amazen.space(3), gap: amazen.space(2) }}>
                  <JobField value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={30} placeholder="+43 1 234 5678" />
                  {!phoneOk ? <AText variant="caption" tone="critical" style={{ fontSize: 12 }}>{t('calendar.phoneInvalid', 'That does not look like a phone number.')}</AText> : null}
                  <FilterRow>{(['OUTGOING', 'INCOMING'] as const).map((d) => pill(t(`calendar.call.${d}`), callDirection === d, () => setCallDirection(d)))}</FilterRow>
                </Well>
              ) : null}

              {crm ? (
                <View style={{ gap: amazen.space(1.5) }}>
                  <SectionLabel>{t('calendar.client', 'Client')}</SectionLabel>
                  {client ? (
                    <FilterRow>{pill(`${client.name}  ✕`, true, () => { setClient(null); if (place === 'CLIENT_SITE') setLocation(''); })}</FilterRow>
                  ) : (
                    <>
                      <JobField value={clientQ} onChangeText={setClientQ} placeholder={t('calendar.clientSearch', 'Search clients…')} />
                      {clients.length ? (
                        <FilterRow>{clients.map((x) => pill(x.name, false, () => {
                          setClient(x); setClientQ(''); setClients([]);
                          if (!phone.trim() && x.phone) setPhone(x.phone);
                        }))}</FilterRow>
                      ) : null}
                    </>
                  )}
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={{ gap: amazen.space(1.5) }}>
            <SectionLabel>{t('calendar.invite', 'People')}</SectionLabel>
            {people.length ? <FilterRow>{people.map((x) => pill(`${x.firstName} ${x.lastName}  ✕`, true, () => setPeople((cur) => cur.filter((y) => y.id !== x.id))))}</FilterRow> : null}
            <JobField value={peopleQ} onChangeText={setPeopleQ} placeholder={t('calendar.searchPeople', 'Add people…')} />
            {found.length ? (
              <FilterRow>{found.filter((x) => !people.some((y) => y.id === x.id)).map((x) => pill(`${x.firstName} ${x.lastName}`, false, () => { setPeople((cur) => [...cur, x]); setPeopleQ(''); }))}</FilterRow>
            ) : null}
          </View>

          <View style={{ gap: amazen.space(1.5) }}>
            <SectionLabel>{t('calendar.remind', 'Remind me')}</SectionLabel>
            <FilterRow>
              {REMIND.map((m) => pill(offsetText(m, t), reminders.includes(m), () => setReminders((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m].sort((a, b) => b - a)))))}
            </FilterRow>
          </View>

          <PrimaryButton label={people.length ? t('calendar.saveAndInvite', 'Save and invite') : t('calendar.save', 'Save')} onPress={save} disabled={!canSave} loading={busy} />
        </ScrollView>
      </KeyboardAvoidingView>

      <DaySheet visible={sheet === 'day'} value={new Date(`${day}T12:00:00`)} onPick={(d) => { setDay(dayKey(d)); setSheet(null); }} onClear={() => setSheet(null)} onClose={() => setSheet(null)} />
      <TimeSheet visible={sheet === 'time'} value={time} onPick={(hm) => { setTime(hm); setSheet(null); }} onClear={() => { setTime(''); setSheet(null); }} onClose={() => setSheet(null)} />
    </Ground>
  );
}
