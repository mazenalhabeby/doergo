import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { useImagePicker, type PickedImage } from '../hooks/useImagePicker';
import { useTimeFormat } from '../hooks/useTimeFormat';
import { StateEyebrow } from './amazen';
import { useWorklog } from './worklog/use-worklog';

export interface WorkLogShift {
  workspace: string | null;
  clockInAt: string;
  /** Null while the shift is running. */
  clockOutAt: string | null;
  tz?: string | null;
  /** The counted figure, on a finished shift. Never called "paid". */
  countedMinutes?: number | null;
  approval?: 'PENDING' | 'APPROVED' | 'REJECTED' | string | null;
}

/** WorkLogSheet's state and handlers — everything before its markup, moved here unchanged. */
export function useWorkLogSheet({
  visible,
  onClose,
  timeEntryId,
  editable = false,
  shift,
}: Pick<{
  visible: boolean;
  onClose: () => void;
  timeEntryId: string;
  /** Only the running shift can be written to; a finished one is read. */
  editable?: boolean;
  shift: WorkLogShift;
}, 'visible' | 'onClose' | 'timeEntryId' | 'editable' | 'shift'>) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t } = useTranslation();
  const { formatClock: formatTime, formatDateRelative } = useTimeFormat();
  const { pickFromGallery, takePhoto } = useImagePicker();
  const log = useWorklog(timeEntryId, visible);

  const [draft, setDraft] = useState('');
  const [picked, setPicked] = useState<PickedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  useEffect(() => { if (!visible) setViewer(null); }, [visible]);

  const tz = shift.tz ?? undefined;
  const clock = (iso: string) => formatTime(iso, tz);
  const start = new Date(shift.clockInAt);
  const running = !shift.clockOutAt;
  /*
    ⚠️ A RUNNING SHIFT'S BAR ENDS AT THE LATER OF NOW AND THE LAST NOTE, never
    at a guessed shift end — "now" is the one end that is a fact.
  */
  const now = new Date();
  const end = shift.clockOutAt ? new Date(shift.clockOutAt) : now;
  const marks = useMemo(() => log.notes.map((n) => ({ at: new Date(n.at), pending: !!n.pendingSync })), [log.notes]);

  const send = async () => {
    if (busy || (!draft.trim() && picked.length === 0)) return;
    setBusy(true);
    const ok = await log.add(draft, picked);
    setBusy(false);
    if (ok) { setDraft(''); setPicked([]); }
  };
  const addPhotos = (imgs: PickedImage[]) => setPicked((p) => [...p, ...imgs].slice(0, 5));

  const eyebrow = running
    ? <StateEyebrow tone="accent" live label={[t('shiftClock.onTheClock', 'On the clock'), shift.workspace].filter(Boolean).join(' · ')} />
    : (
        <StateEyebrow
          label={[t('worklog.done', 'Done'), formatDateRelative(shift.clockInAt, tz), shift.workspace]
            .filter(Boolean)
            .join(' · ')}
        />
      );

  return {
    amazen,
    c,
    t,
    pickFromGallery,
    takePhoto,
    log,
    draft,
    setDraft,
    picked,
    setPicked,
    busy,
    viewer,
    setViewer,
    clock,
    start,
    running,
    now,
    end,
    marks,
    send,
    addPhotos,
    eyebrow,
  };
}
