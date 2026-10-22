import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { accessAllowsAnywhere } from '@hbcfield/shared/client';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';
import { useTimeFormat } from '@/hooks/use-time-format';
import { useImagePicker, type PickedImage } from '@/hooks/use-image-picker';
import { locationsApi } from '@/lib/api';
import { ROUTES } from '@/lib/constants';
import { useResponsive } from '@/lib/responsive';
import { useTabSafe } from '@/components/amazen';
import { centeredContent } from '@/components/screen-container';
import { type AssignMember } from '../job/sheets/assign-sheet';
import { useCreateJob } from './use-create-job';
import {
  adoptClient,
  buildCreateInput,
  canCreate,
  defaultSpace,
  isUntouched,
  type ClientParams,
  type Priority,
} from './new-job-logic';
import { type Sheet } from './new-job-photos';

/** NewJobScreen's state and handlers — everything before its markup, moved here unchanged. */
export function useNewJobScreen() {
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
  const params = useLocalSearchParams<{
    customerId?: string | string[];
    spaceId?: string | string[];
    customerName?: string | string[];
  }>() as ClientParams;
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

  return {
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
  };
}
