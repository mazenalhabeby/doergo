import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { MEETING_PROVIDER_NAMES, spanMinutes, durationText, personName } from '@hbcfield/shared/client';
import { AText, FilterRow, PrimaryButton, Well, JobField, SectionLabel } from '../../components/amazen';
import { offsetText } from './event-sheet';
import { REMIND } from './new-event-screen-helpers';
import type { NewEventScreenState } from './use-new-event-screen-logic';

/** Part of NewEventScreen's markup, moved here unchanged; it reads the page's state from `vm`. */
export function NewEventScreenAppointment({ vm }: { vm: NewEventScreenState }) {
  const {
    amazen,
    pill,
    t,
    kind,
    setKind,
    access,
    openTimeOff,
    openJob,
    title,
    setTitle,
    label,
    day,
    setSheet,
    time,
    endDay,
    endTime,
    start,
    end,
    problem,
    mode,
    setMode,
    offices,
    crm,
    place,
    setLocation,
    setPlace,
    officeId,
    setOfficeId,
    room,
    setRoom,
    client,
    addresses,
    location,
    c,
    meetingUrl,
    setMeetingUrl,
    provider,
    phone,
    setPhone,
    phoneOk,
    callDirection,
    setCallDirection,
    setClient,
    clientQ,
    setClientQ,
    clients,
    setClients,
    people,
    setPeople,
    peopleQ,
    setPeopleQ,
    found,
    reminders,
    setReminders,
    save,
    canSave,
    busy,
  } = vm;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: amazen.space(4), gap: amazen.space(3.5), paddingBottom: 80 }}>
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
              {problem === 'END_BEFORE_START'
                ? t('calendar.endBeforeStart')
                : problem === 'TOO_LONG'
                  ? t('calendar.tooLong', { days: 14 })
                  : t('calendar.durationAuto', { value: durationText(spanMinutes(start, end), (k, o) => t(k, o)) })}
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
                    <JobField
                      value={room}
                      onChangeText={setRoom}
                      maxLength={80}
                      placeholder={t('calendar.roomPlaceholder', 'Room (optional)')}
                    />
                    <AText variant="caption" tone="muted" style={{ fontSize: 12 }}>
                      {t('calendar.officeAddressAuto', "The office's address is added for everyone automatically.")}
                    </AText>
                  </>
                ) : null}
                {place === 'CLIENT_SITE' ? (
                  !client ? (
                    <AText variant="caption" tone="warn" style={{ fontSize: 12 }}>
                      {t('calendar.pickClientFirst', 'Choose the client below first.')}
                    </AText>
                  )
                  : addresses.length ? (
                    <View style={{ gap: 6 }}>
                      <AText variant="caption" tone="muted" style={{ fontSize: 12 }}>{t('calendar.whichAddress', 'Which address')}</AText>
                      {addresses.map((a) => (
                        <Pressable
                          key={a.id}
                          onPress={() => setLocation(a.address)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: location === a.address }}
                          style={{
                            borderRadius: 12,
                            padding: amazen.space(2.5),
                            borderWidth: 1.5,
                            borderColor: location === a.address ? c.accent : c.lineWell,
                            backgroundColor: location === a.address ? c.accentTint : 'transparent',
                          }}>
                          <AText variant="body" tone="strong" style={{ fontSize: 13.5 }} numberOfLines={1}>{a.label}</AText>
                          {a.label !== a.address ? (
                            <AText variant="caption" tone="muted" numberOfLines={1} style={{ fontSize: 12 }}>
                              {a.address}
                            </AText>
                          ) : null}
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <JobField
                      value={location}
                      onChangeText={setLocation}
                      maxLength={200}
                      placeholder={t('calendar.addressPlaceholder', 'Street, town')}
                    />
                  )
                ) : null}
                {place === 'ADDRESS' ? (
                  <JobField
                    value={location}
                    onChangeText={setLocation}
                    maxLength={200}
                    placeholder={t('calendar.addressPlaceholder', 'Street, town')}
                  />
                ) : null}
              </Well>
            ) : null}

            {mode === 'ONLINE' ? (
              <Well style={{ padding: amazen.space(3), gap: amazen.space(2) }}>
                <JobField
                  value={meetingUrl}
                  onChangeText={setMeetingUrl}
                  autoCapitalize="none"
                  keyboardType="url"
                  placeholder="https://teams.microsoft.com/…"
                />
                {provider ? (
                  <AText variant="caption" tone="accent" style={{ fontSize: 12 }}>
                    {t('calendar.linkRecognised', {
                      defaultValue: '{{name}} — a Join button appears in the calendar',
                      name: MEETING_PROVIDER_NAMES[provider],
                    })}
                  </AText>
                ) : null}
              </Well>
            ) : null}

            {mode === 'PHONE' ? (
              <Well style={{ padding: amazen.space(3), gap: amazen.space(2) }}>
                <JobField value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={30} placeholder="+43 1 234 5678" />
                {!phoneOk ? (
                  <AText variant="caption" tone="critical" style={{ fontSize: 12 }}>
                    {t('calendar.phoneInvalid', 'That does not look like a phone number.')}
                  </AText>
                ) : null}
                <FilterRow>
                  {(['OUTGOING', 'INCOMING'] as const).map((d) =>
                    pill(t(`calendar.call.${d}`), callDirection === d, () => setCallDirection(d)),
                  )}
                </FilterRow>
              </Well>
            ) : null}

            {crm ? (
              <View style={{ gap: amazen.space(1.5) }}>
                <SectionLabel>{t('calendar.client', 'Client')}</SectionLabel>
                {client ? (
                  <FilterRow>
                    {pill(`${client.name}  ✕`, true, () => {
                      setClient(null);
                      if (place === 'CLIENT_SITE') setLocation('');
                    })}
                  </FilterRow>
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
          {people.length ? (
            <FilterRow>
              {people.map((x) =>
                pill(`${personName(x)}  ✕`, true, () => setPeople((cur) => cur.filter((y) => y.id !== x.id))),
              )}
            </FilterRow>
          ) : null}
          <JobField value={peopleQ} onChangeText={setPeopleQ} placeholder={t('calendar.searchPeople', 'Add people…')} />
          {found.length ? (
            <FilterRow>
              {found
                .filter((x) => !people.some((y) => y.id === x.id))
                .map((x) =>
                  pill(personName(x), false, () => {
                    setPeople((cur) => [...cur, x]);
                    setPeopleQ('');
                  }),
                )}
            </FilterRow>
          ) : null}
        </View>

        <View style={{ gap: amazen.space(1.5) }}>
          <SectionLabel>{t('calendar.remind', 'Remind me')}</SectionLabel>
          <FilterRow>
            {REMIND.map((m) =>
              pill(offsetText(m, t), reminders.includes(m), () =>
                setReminders((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m].sort((a, b) => b - a))),
              ),
            )}
          </FilterRow>
        </View>

        <PrimaryButton
          label={people.length ? t('calendar.saveAndInvite', 'Save and invite') : t('calendar.save', 'Save')}
          onPress={save}
          disabled={!canSave}
          loading={busy}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
