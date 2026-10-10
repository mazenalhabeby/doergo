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
import { Ground, AText, HeaderBack, PrimaryButton, ScreenHeader, Well, useTabSafe } from '../amazen';
import { LocationSearchPicker } from '../location-search-picker';
import { centeredContent } from '../screen-container';
import { FilterChips } from '../jobs-list/jobs-controls';
import { Banner, ChoiceRow, JobField, QuietButton, RoundButton, SectionLabel } from '../job/job-ui';
import { CameraGlyph, CloseGlyph, GalleryGlyph } from '../job/job-glyphs';
import { AddTile } from '../job/job-files';
import { AssignSheet, type AssignMember } from '../job/sheets/assign-sheet';
import { DaySheet, TimeSheet } from './when-sheets';
import { useCreateJob } from './use-create-job';
import {
  PRIORITIES, adoptClient, buildCreateInput, canCreate, defaultSpace, isUntouched,
  type ClientParams, type Priority,
} from './new-job-logic';

type Sheet = 'day' | 'time' | 'assign';

/**
 * NEW JOB — `docs/design/job-flow.html`, `renderCreate()`.
 *
 * One well: what needs doing, details, the workspace, how urgent, when, where,
 * who does it (only for somebody who may assign) and photos. "Create job"
 * waits for a title. Every popup is the one sheet — the day, the hour and the
 * person — and ONE sheet state holds them, so two are never asked for at once.
 */
export function NewJobScreen() {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const tabSafe = useTabSafe();
  const r = useResponsive();
  const { user } = useAuth();
  const { formatDueDate, formatSchedule } = useTimeFormat();
  const { pickFromGallery, takePhoto } = useImagePicker();
  const { create, submitting } = useCreateJob();
  // Org-wide OR held in a space — the flat column carries only the first.
  const canAssign = user?.canAssignTasks === true || accessAllowsAnywhere(user?.access as never, 'canAssignTasks');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [day, setDay] = useState<Date | null>(null);
  /* "HH:mm", "" when the job is only dated — midnight is "no hour" (dueDateFor). */
  const [time, setTime] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [assignee, setAssignee] = useState<AssignMember | null>(null);
  const [spaces, setSpaces] = useState<{ id: string; name: string }[]>([]);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [client, setClient] = useState<{ id: string; name: string } | null>(null);
  const [photos, setPhotos] = useState<PickedImage[]>([]);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  // Bumped on reset, so the address search forgets what was typed into it.
  const [formKey, setFormKey] = useState(0);

  /*
    RAISED FROM A CLIENT RECORD — adopted once, then cleared from the route
    (`adoptClient`). The effect acts only on a non-empty id and its own
    `setParams` empties it, which is what keeps it from looping.
  */
  const params = useLocalSearchParams<{ customerId?: string | string[]; spaceId?: string | string[]; customerName?: string | string[] }>() as ClientParams;
  const adopted = adoptClient(params);
  const adoptedKey = adopted ? `${adopted.client.id}|${adopted.client.name}|${adopted.spaceId ?? ''}` : '';
  /*
    OPENED FROM THE CALENDAR'S New › Job (`?due=<ISO>`): the day, and the hour unless it is
    midnight ("no hour", as dueDateFor reads it). Adopted once, then cleared from the route.
  */
  const dueParam = useLocalSearchParams<{ due?: string | string[] }>().due;
  const due = typeof dueParam === 'string' ? dueParam : '';
  useEffect(() => {
    if (!due) return;
    const d = new Date(due);
    if (!Number.isNaN(d.getTime())) {
      setDay(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
      setTime(d.getHours() || d.getMinutes() ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '');
    }
    router.setParams({ due: '' });
  }, [due]);

  useEffect(() => {
    if (!adopted) return;
    setClient(adopted.client);
    // An explicit workspace beats the default below, which never overwrites a chosen one.
    if (adopted.spaceId) setSpaceId(adopted.spaceId);
    router.setParams({ customerId: '', spaceId: '', customerName: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on what arrived
  }, [adoptedKey]);

  /*
    LEAVING A FORM NOBODY STARTED DROPS THE CLIENT. Read through a ref so the
    cleanup runs on BLUR, not on every keystroke. A half-written client visit
    is the member's work and keeps its client.
  */
  const untouchedRef = useRef(true);
  untouchedRef.current = isUntouched({ title, description, day, photoCount: photos.length });
  useFocusEffect(useCallback(() => () => { if (untouchedRef.current) setClient(null); }, []));

  // Every job needs a workspace: the org's default. ⚠️ Never over a workspace already chosen.
  useEffect(() => {
    locationsApi
      .list()
      .then((list) => {
        const opts = list.map((l) => ({ id: l.id, name: l.name, isDefault: (l as { isDefault?: boolean }).isDefault }));
        setSpaces(opts.map(({ id, name }) => ({ id, name })));
        const def = defaultSpace(opts);
        if (def) setSpaceId((prev) => prev ?? def);
      })
      .catch(() => undefined);
  }, []);

  const reset = () => {
    setTitle('');
    setDescription('');
    setPriority('MEDIUM');
    setDay(null);
    setTime('');
    setAddress('');
    setLat(null);
    setLng(null);
    setAssignee(null);
    setPhotos([]);
    // The next job typed here is a new job. The workspace stays — it is a setting, not a binding.
    setClient(null);
    setFormKey((k) => k + 1);
  };

  const submit = async () => {
    if (!canCreate(title, submitting)) return;
    const input = buildCreateInput({
      title, description, priority, day, time, address, lat, lng, spaceId,
      clientId: client?.id ?? null, assigneeId: assignee?.id ?? null, canAssign,
    });
    const result = await create(input, photos);
    if (result.kind === 'failed') return;
    reset();
    if (result.kind === 'created') router.push(ROUTES.taskDetail(result.id) as Href);
  };

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.navigate('/(app)/(tabs)/tasks' as Href);
  };

  /* ---------------- the form ---------------- */

  const wide = r.isTablet ? centeredContent(640) : null;
  const gap = amazen.space(3);
  const field = { gap: amazen.space(2) };

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
          contentContainerStyle={[{ paddingHorizontal: amazen.space(4), paddingTop: amazen.space(1), paddingBottom: tabSafe, gap: amazen.space(3.5) }, wide]}
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
            <JobField value={title} onChangeText={setTitle} placeholder={t('job.edit.titlePlaceholder')} maxLength={200} accessibilityLabel={t('job.edit.titlePlaceholder')} />
            <JobField value={description} onChangeText={setDescription} placeholder={t('job.edit.detailsPlaceholder')} multiline maxLength={1000} accessibilityLabel={t('job.edit.detailsPlaceholder')} />

            {spaces.length > 1 ? (
              <View style={field}>
                <SectionLabel>{t('job.facts.workspace')}</SectionLabel>
                <FilterChips options={spaces.map((s) => ({ key: s.id, label: s.name }))} value={spaceId ?? ''} onChange={(id) => setSpaceId(id)} />
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
                  <QuietButton label={day ? formatDueDate(day) : t('newJob.pickDay')} tone={day ? 'strong' : 'accent'} onPress={() => setSheet('day')} />
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
      <DaySheet visible={sheet === 'day'} value={day} onPick={setDay} onClear={() => { setDay(null); setTime(''); }} onClose={() => setSheet(null)} />
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

/** Photos — four across, each with a ✕, then the camera and the gallery (`.photos`). */
function NewJobPhotos({ photos, onRemove, onCamera, onGallery }: {
  photos: PickedImage[];
  onRemove: (index: number) => void;
  onCamera: () => void;
  onGallery: () => void;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const [width, setWidth] = useState(0);
  const side = width > 0 ? Math.floor((width - 3 * 8) / 4) : 0;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, minHeight: side || 60 }}>
      {photos.map((p, i) => (
        <View key={`${p.uri}:${i}`} style={{ width: side, height: side, borderRadius: 14, overflow: 'hidden', backgroundColor: c.tile }}>
          <Image source={{ uri: p.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          <Pressable
            onPress={() => onRemove(i)}
            accessibilityRole="button"
            accessibilityLabel={t('common.remove')}
            hitSlop={6}
            style={{ position: 'absolute', right: 4, top: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: c.canvas, alignItems: 'center', justifyContent: 'center' }}
          >
            <CloseGlyph size={11} color={c.inkStrong} />
          </Pressable>
        </View>
      ))}
      <AddTile side={side} label={t('job.files.camera')} onPress={onCamera}>
        <CameraGlyph size={20} color={c.inkMuted} contrast={c.well} />
      </AddTile>
      <AddTile side={side} label={t('job.files.gallery')} onPress={onGallery}>
        <GalleryGlyph size={20} color={c.inkMuted} contrast={c.well} />
      </AddTile>
    </View>
  );
}
