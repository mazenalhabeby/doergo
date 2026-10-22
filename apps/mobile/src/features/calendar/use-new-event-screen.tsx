import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  cleanPhone,
  meetingProvider,
  moduleAnywhere,
  localInstant,
  spanProblem,
  moveEndWithStart,
  type CallDirection,
  type MeetingMode,
  type PlaceKind,
} from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { useToast } from '../../island/island-context';
import { FilterPill } from '../../components/amazen';
import {
  calendarApi,
  customersApi,
  locationsApi,
  type CalendarPerson,
  type MobileCustomer,
} from '../../lib/api';
import { crmCapsOf } from '../../lib/member-reach';
import { tabAccessFor } from '../../lib/tab-layout';
import { dayKey, forgetCalendarPages } from './calendar-data';
import { calendarError } from './errors';

export type Kind = 'APPOINTMENT' | 'REMINDER';

/** NewEventScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useNewEventScreen() {
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
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(startDay);
  // No time = all day. The end is a day and a time too; the duration is worked out, never picked.
  const [time, setTime] = useState(startHour != null ? `${String(startHour).padStart(2, '0')}:00` : '');
  const [endDay, setEndDay] = useState(startDay);
  const [endTime, setEndTime] = useState(startHour != null ? `${String(Math.min(startHour + 1, 23)).padStart(2, '0')}:00` : '');
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
  const [sheet, setSheet] = useState<'day' | 'time' | 'endDay' | 'endTime' | null>(null);
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

  useEffect(() => {
    if (!crm || !clientQ.trim()) { setClients([]); return; }
    let live = true;
    const id = setTimeout(
      () =>
        customersApi
          .list({ search: clientQ.trim(), limit: 8 })
          .then((r) => {
            if (live) setClients(r);
          })
          .catch(() => undefined),
      220,
    );
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
  const start = time ? localInstant(day, time) : null;
  const end = time && endTime ? localInstant(endDay, endTime) : null;
  // Shared with the web and the server (calendar/span.ts).
  const problem = start && end ? spanProblem(start, end) : endDay < day ? 'END_BEFORE_START' : null;
  const label = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  /** Moving the start carries the end with it, so the duration already set is kept. */
  const pickStart = (d: string, tm: string) => {
    if (!tm) { setDay(d); setTime(''); setEndTime(''); if (endDay < d) setEndDay(d); return; }
    const next = localInstant(d, tm);
    const prevEnd = start && end ? moveEndWithStart(start, end, next) : new Date(next.getTime() + 60 * 60000);
    setDay(d); setTime(tm); setEndDay(dayKey(prevEnd));
    setEndTime(`${String(prevEnd.getHours()).padStart(2, '0')}:${String(prevEnd.getMinutes()).padStart(2, '0')}`);
  };
  const canSave =
    !!title.trim() &&
    !busy &&
    phoneOk &&
    !problem &&
    !(kind === 'APPOINTMENT' && mode === 'IN_PERSON' && place === 'CLIENT_SITE' && (!client || !location.trim()));

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      await calendarApi.create({
        kind, title: title.trim(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...(start && end
          ? { startAt: start.toISOString(), endAt: end.toISOString() }
          : { allDay: true, startDate: day, endDate: endDay < day ? day : endDay }),
        reminders, attendeeIds: people.map((x) => x.id),
        ...(crm ? { customerId: client?.id ?? null } : {}),
        ...(kind === 'APPOINTMENT' ? {
          meetingMode: mode, placeKind: mode === 'IN_PERSON' ? place : null, placeSpaceId: place === 'OFFICE' ? officeId || null : null,
          room: room.trim() || null, location: location.trim() || null, meetingUrl: meetingUrl.trim() || null,
          phone: phone.trim() || null, callDirection,
        } : {}),
      });
      forgetCalendarPages();
      toast.success(
        people.length
          ? t('calendar.invitedToast', { count: people.length })
          : t('calendar.createdToast', 'Added to your calendar'),
      );
      router.back();
    } catch (e) {
      toast.error(t('common.error', 'Error'), calendarError(e, t));
    } finally {
      setBusy(false);
    }
  };

  const openJob = () =>
    router.replace({
      pathname: '/(app)/(tabs)/create-task',
      params: { due: (start ?? new Date(`${day}T00:00:00`)).toISOString() },
    } as never);
  const openTimeOff = () => router.replace({ pathname: '/(app)/(tabs)/time-off', params: { from: day } } as never);

  const pill = (label: string, on: boolean, onPress: () => void) => <FilterPill key={label} label={label} on={on} onPress={onPress} />;

  return {
    amazen,
    c,
    t,
    access,
    crm,
    kind,
    setKind,
    title,
    setTitle,
    day,
    time,
    endDay,
    setEndDay,
    endTime,
    setEndTime,
    mode,
    setMode,
    place,
    setPlace,
    offices,
    officeId,
    setOfficeId,
    room,
    setRoom,
    location,
    setLocation,
    meetingUrl,
    setMeetingUrl,
    phone,
    setPhone,
    callDirection,
    setCallDirection,
    client,
    setClient,
    clientQ,
    setClientQ,
    clients,
    setClients,
    addresses,
    people,
    setPeople,
    peopleQ,
    setPeopleQ,
    found,
    reminders,
    setReminders,
    sheet,
    setSheet,
    busy,
    provider,
    phoneOk,
    start,
    end,
    problem,
    label,
    pickStart,
    canSave,
    save,
    openJob,
    openTimeOff,
    pill,
  };
}
