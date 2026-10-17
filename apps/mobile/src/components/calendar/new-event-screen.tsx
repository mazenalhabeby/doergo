import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MEETING_PROVIDER_NAMES, cleanPhone, meetingProvider, moduleAnywhere, localInstant, spanMinutes, spanProblem, moveEndWithStart, durationText, type CallDirection, type MeetingMode, type PlaceKind, personName } from '@hbcfield/shared/client';
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
import { useNewEventScreen } from './use-new-event-screen';
import { REMIND } from './new-event-screen-helpers';

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
  const {
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
  } = useNewEventScreen();

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
            <SectionLabel>{t('calendar.titleLabel', 'Title')}</SectionLabel>
            <JobField value={title} onChangeText={setTitle} maxLength={140} placeholder={t('calendar.titlePlaceholder', 'What is it?')} />
          </View>

          <View style={{ gap: amazen.space(1.5) }}>
            <SectionLabel>{t('calendar.when', 'When')}</SectionLabel>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
              <AText variant="caption" tone="muted" style={{ width: 52 }}>{t('calendar.starts', 'Starts')}</AText>
              <FilterRow>
                {pill(label(day), true, () => setSheet('day'))}
                {pill(time || t('calendar.allDay', 'All day'), !!time, () => setSheet('time'))}
              </FilterRow>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
              <AText variant="caption" tone="muted" style={{ width: 52 }}>{t('calendar.ends', 'Ends')}</AText>
              <FilterRow>
                {pill(label(endDay), true, () => setSheet('endDay'))}
                {time ? pill(endTime || '—', !!endTime, () => setSheet('endTime')) : null}
              </FilterRow>
            </View>
            {start && end ? (
              <AText variant="caption" tone={problem ? 'critical' : 'muted'} style={{ fontSize: 12 }}>
                {problem === 'END_BEFORE_START' ? t('calendar.endBeforeStart') : problem === 'TOO_LONG' ? t('calendar.tooLong', { days: 14 }) : t('calendar.durationAuto', { value: durationText(spanMinutes(start, end), (k, o) => t(k, o)) })}
              </AText>
            ) : problem ? <AText variant="caption" tone="critical" style={{ fontSize: 12 }}>{t('calendar.endBeforeStart')}</AText> : null}
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
            {people.length ? <FilterRow>{people.map((x) => pill(`${personName(x)}  ✕`, true, () => setPeople((cur) => cur.filter((y) => y.id !== x.id))))}</FilterRow> : null}
            <JobField value={peopleQ} onChangeText={setPeopleQ} placeholder={t('calendar.searchPeople', 'Add people…')} />
            {found.length ? (
              <FilterRow>{found.filter((x) => !people.some((y) => y.id === x.id)).map((x) => pill(personName(x), false, () => { setPeople((cur) => [...cur, x]); setPeopleQ(''); }))}</FilterRow>
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

      <DaySheet visible={sheet === 'day'} value={new Date(`${day}T12:00:00`)} onPick={(d) => { pickStart(dayKey(d), time); setSheet(null); }} onClear={() => setSheet(null)} onClose={() => setSheet(null)} />
      <TimeSheet visible={sheet === 'time'} value={time} onPick={(hm) => { pickStart(day, hm); setSheet(null); }} onClear={() => { pickStart(day, ''); setSheet(null); }} onClose={() => setSheet(null)} />
      <DaySheet visible={sheet === 'endDay'} value={new Date(`${endDay}T12:00:00`)} onPick={(d) => { setEndDay(dayKey(d)); setSheet(null); }} onClear={() => setSheet(null)} onClose={() => setSheet(null)} />
      <TimeSheet visible={sheet === 'endTime'} value={endTime} onPick={(hm) => { setEndTime(hm); setSheet(null); }} onClear={() => setSheet(null)} onClose={() => setSheet(null)} />
    </Ground>
  );
}
