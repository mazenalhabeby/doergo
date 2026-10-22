import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { accessAllowsAnywhere, personName } from '@hbcfield/shared/client';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { useImagePicker, type PickedImage } from '../../hooks/useImagePicker';
import { locationsApi } from '../../lib/api';
import { ROUTES } from '../../lib/constants';
import { useResponsive } from '../../lib/responsive';
import {
  Ground,
  AText,
  HeaderBack,
  PrimaryButton,
  ScreenHeader,
  Well,
  useTabSafe,
  Banner,
  ChoiceRow,
  JobField,
  QuietButton,
  RoundButton,
  SectionLabel,
} from '../../components/amazen';
import { LocationSearchPicker } from '../../components/location-search-picker';
import { centeredContent } from '../../components/screen-container';
import { FilterChips } from '../jobs-list/jobs-controls';
import { CameraGlyph, CloseGlyph, GalleryGlyph } from '../job/job-glyphs';
import { AddTile } from '../job/job-files';
import { AssignSheet, type AssignMember } from '../job/sheets/assign-sheet';
import { DaySheet, TimeSheet } from './when-sheets';
import { useCreateJob } from './use-create-job';
import {
  PRIORITIES, adoptClient, buildCreateInput, canCreate, defaultSpace, isUntouched,
  type ClientParams, type Priority,
} from './new-job-logic';
import { type Sheet, NewJobPhotos } from './new-job-photos';
import { useNewJobScreen } from './use-new-job-screen';

/**
 * NEW JOB — `docs/design/job-flow.html`, `renderCreate()`.
 *
 * One well: what needs doing, details, the workspace, how urgent, when, where,
 * who does it (only for somebody who may assign) and photos. "Create job"
 * waits for a title. Every popup is the one sheet — the day, the hour and the
 * person — and ONE sheet state holds them, so two are never asked for at once.
 */
export function NewJobScreen() {
  const {
    amazen,
    t,
    tabSafe,
    formatDueDate,
    formatSchedule,
    pickFromGallery,
    takePhoto,
    submitting,
    canAssign,
    title,
    setTitle,
    description,
    setDescription,
    priority,
    setPriority,
    day,
    setDay,
    time,
    setTime,
    address,
    setAddress,
    lat,
    setLat,
    lng,
    setLng,
    assignee,
    setAssignee,
    spaces,
    spaceId,
    setSpaceId,
    client,
    setClient,
    photos,
    setPhotos,
    sheet,
    setSheet,
    formKey,
    submit,
    back,
    wide,
    gap,
    field,
  } = useNewJobScreen();

  return (
    <Ground style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* ⚠️ THE ONE HEADER — the amazen `ScreenHeader` with Back in its leading slot and the avatar top right. */}
        <ScreenHeader
          title={t('newJob.title')}
          style={wide ?? undefined}
          leading={<HeaderBack onPress={back} />}
        />

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            {
              paddingHorizontal: amazen.space(4),
              paddingTop: amazen.space(1),
              paddingBottom: tabSafe,
              gap: amazen.space(3.5),
            },
            wide,
          ]}
        >
          {/* Who this job is for — the one fact not typed here, so it is visible and removable. */}
          {client ? (
            <Banner
              tone="accent"
              text={`${t('createTask.forClient')}: ${client.name || t('createTask.forClientUnnamed')}`}
              action={{ label: t('createTask.clearClient'), onPress: () => setClient(null) }}
            />
          ) : null}

          <Well style={{ padding: amazen.space(4), gap }}>
            <JobField
              value={title}
              onChangeText={setTitle}
              placeholder={t('job.edit.titlePlaceholder')}
              maxLength={200}
              accessibilityLabel={t('job.edit.titlePlaceholder')}
            />
            <JobField
              value={description}
              onChangeText={setDescription}
              placeholder={t('job.edit.detailsPlaceholder')}
              multiline
              maxLength={1000}
              accessibilityLabel={t('job.edit.detailsPlaceholder')}
            />

            {spaces.length > 1 ? (
              <View style={field}>
                <SectionLabel>{t('job.facts.workspace')}</SectionLabel>
                <FilterChips
                  options={spaces.map((s) => ({ key: s.id, label: s.name }))}
                  value={spaceId ?? ''}
                  onChange={(id) => setSpaceId(id)}
                />
              </View>
            ) : null}

            <View style={field}>
              <SectionLabel>{t('job.edit.urgency')}</SectionLabel>
              <ChoiceRow options={PRIORITIES.map((p) => ({ key: p, label: t(`priority.${p}`) }))} value={priority} onChange={setPriority} />
            </View>

            <View style={field}>
              <SectionLabel>{t('job.facts.when')}</SectionLabel>
              <View style={{ flexDirection: 'row', gap: amazen.space(2) }}>
                <View style={{ flex: 1 }}>
                  <QuietButton
                    label={day ? formatDueDate(day) : t('newJob.pickDay')}
                    tone={day ? 'strong' : 'accent'}
                    onPress={() => setSheet('day')}
                  />
                </View>
                {/* An hour with no day is not a thing anybody can act on. */}
                <View style={{ flex: 1 }}>
                  <QuietButton label={time ? formatSchedule(time) : t('newJob.noHour')} onPress={() => setSheet('time')} disabled={!day} />
                </View>
              </View>
              {day ? <AText variant="caption" tone="ink">{t('createTask.beThereHint')}</AText> : null}
            </View>

            <View style={field}>
              <SectionLabel>{t('job.facts.where')}</SectionLabel>
              <LocationSearchPicker
                key={formKey}
                address={address}
                lat={lat}
                lng={lng}
                onLocationChange={(addr, la, ln) => { setAddress(addr); setLat(la); setLng(ln); }}
              />
            </View>

            {canAssign ? (
              <View style={field}>
                <SectionLabel>{t('newJob.who')}</SectionLabel>
                <View style={{ flexDirection: 'row', gap: amazen.space(2), alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <QuietButton
                      tone="accent"
                      label={`${assignee ? personName(assignee) : t('job.facts.nobody')} ›`}
                      onPress={() => setSheet('assign')}
                    />
                  </View>
                  {assignee ? <RoundButton Glyph={CloseGlyph} label={t('common.remove')} onPress={() => setAssignee(null)} /> : null}
                </View>
              </View>
            ) : null}

            <View style={field}>
              <SectionLabel>{t('createTask.photosLabel')}</SectionLabel>
              <NewJobPhotos
                photos={photos}
                onRemove={(i) => setPhotos((prev) => prev.filter((_, k) => k !== i))}
                onCamera={async () => { const p = await takePhoto(); if (p) setPhotos((prev) => [...prev, p]); }}
                onGallery={async () => { const ps = await pickFromGallery(); if (ps.length) setPhotos((prev) => [...prev, ...ps]); }}
              />
            </View>
          </Well>

          <PrimaryButton label={t('newJob.create')} onPress={() => void submit()} disabled={!canCreate(title)} loading={submitting} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ⚠️ ONE sheet state — the day, the hour and the person are never asked for at once. */}
      <DaySheet
        visible={sheet === 'day'}
        value={day}
        onPick={setDay}
        onClear={() => {
          setDay(null);
          setTime('');
        }}
        onClose={() => setSheet(null)}
      />
      <TimeSheet visible={sheet === 'time'} value={time} onPick={setTime} onClear={() => setTime('')} onClose={() => setSheet(null)} />
      {canAssign ? (
        <AssignSheet
          visible={sheet === 'assign'}
          current={assignee?.id ?? null}
          spaceId={spaceId}
          onPick={(m) => { setAssignee(m); setSheet(null); }}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </Ground>
  );
}
