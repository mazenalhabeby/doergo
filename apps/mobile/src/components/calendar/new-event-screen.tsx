import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  MEETING_PROVIDER_NAMES,
  cleanPhone,
  meetingProvider,
  moduleAnywhere,
  localInstant,
  spanMinutes,
  spanProblem,
  moveEndWithStart,
  durationText,
  type CallDirection,
  type MeetingMode,
  type PlaceKind,
  personName,
} from '@hbcfield/shared/client';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { useToast } from '../../island/island-context';
import { AText, FilterPill, FilterRow, Ground, PrimaryButton, Well, JobField, SectionLabel } from '../amazen';
import { DaySheet, TimeSheet } from '../new-job/when-sheets';
import { calendarApi, customersApi, locationsApi, type CalendarPerson, type MobileCustomer } from '../../lib/api';
import { crmCapsOf } from '../../lib/member-reach';
import { tabAccessFor } from '../../lib/tab-layout';
import { dayKey, forgetCalendarPages } from './calendar-data';
import { calendarError } from './errors';
import { offsetText } from './event-sheet';
import { useNewEventScreen } from './use-new-event-screen';
import { REMIND } from './new-event-screen-helpers';
import { useNewEventScreenLogic } from './use-new-event-screen-logic';
import { NewEventScreenAppointment } from './new-event-screen-appointment';

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
  const vm = useNewEventScreenLogic();
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
  } = vm;

  return (
    <Ground style={{ flex: 1 }}>
      <View
        style={{
          paddingTop: 54,
          paddingHorizontal: amazen.space(4),
          paddingBottom: amazen.space(2.5),
          flexDirection: 'row',
          alignItems: 'center',
          borderBottomWidth: 1,
          borderColor: c.lineWell,
        }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={10}>
          <AText variant="body" tone="ink">
            {t('common.cancel', 'Cancel')}
          </AText>
        </Pressable>
        <AText variant="body" tone="strong" style={{ flex: 1, textAlign: 'center', fontSize: 16 }}>{t('calendar.new', 'New')}</AText>
        <Pressable onPress={save} disabled={!canSave} accessibilityRole="button" hitSlop={10} style={{ opacity: canSave ? 1 : 0.4 }}>
          <AText variant="body" tone="accent" style={{ fontWeight: '600' }}>
            {people.length ? t('calendar.saveAndInvite', 'Save and invite') : t('calendar.save', 'Save')}
          </AText>
        </Pressable>
      </View>

      <NewEventScreenAppointment vm={vm} />

      <DaySheet
        visible={sheet === 'day'}
        value={new Date(`${day}T12:00:00`)}
        onPick={(d) => {
          pickStart(dayKey(d), time);
          setSheet(null);
        }}
        onClear={() => setSheet(null)}
        onClose={() => setSheet(null)}
      />
      <TimeSheet
        visible={sheet === 'time'}
        value={time}
        onPick={(hm) => {
          pickStart(day, hm);
          setSheet(null);
        }}
        onClear={() => {
          pickStart(day, '');
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />
      <DaySheet
        visible={sheet === 'endDay'}
        value={new Date(`${endDay}T12:00:00`)}
        onPick={(d) => {
          setEndDay(dayKey(d));
          setSheet(null);
        }}
        onClear={() => setSheet(null)}
        onClose={() => setSheet(null)}
      />
      <TimeSheet
        visible={sheet === 'endTime'}
        value={endTime}
        onPick={(hm) => {
          setEndTime(hm);
          setSheet(null);
        }}
        onClear={() => setSheet(null)}
        onClose={() => setSheet(null)}
      />
    </Ground>
  );
}
