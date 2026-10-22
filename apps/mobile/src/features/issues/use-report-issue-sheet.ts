import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { useToast } from '@/island/island-context';
import { useOffline } from '@/offline/offline-context';
import { useQueuedWrite } from '@/offline/actions/queued-write';
import { keepCreated } from '@/offline/actions/keep-created';
import { reportIssueFromPhone } from '@/offline/issues/issue-actions';
import { shiftIssuesApi, type ShiftIssue } from '@/lib/api/shift-issues';
import { useImagePicker, type PickedImage } from '@/hooks/use-image-picker';
import { MAX_PHOTOS, uploadPhotos } from './photos';

/** ReportIssueSheet's state and handlers — everything before its markup, moved here unchanged. */
export function useReportIssueSheet({
  visible,
  onClose,
  timeEntryId,
  spaceId,
  workspace,
  since,
  initialTitle,
  initialDescription,
  onCreated,
}: Pick<
  {
    visible: boolean;
    onClose: () => void;
    timeEntryId?: string;
    spaceId?: string;
    /** The workspace this is filed against — shown, because it is being sent. */
    workspace?: string | null;
    /** When the shift started — shown for the same reason. */
    since?: string | null;
    /** A report the app has already written for them — a refused clock-in says what was refused, when, and why. */
    initialTitle?: string;
    initialDescription?: string;
    /** The thread, once the member asks to open it. */
    onCreated: (id: string) => void;
  },
  | 'visible'
  | 'onClose'
  | 'timeEntryId'
  | 'spaceId'
  | 'workspace'
  | 'since'
  | 'initialTitle'
  | 'initialDescription'
  | 'onCreated'
>) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const toast = useToast();
  const offline = useOffline();
  const write = useQueuedWrite();
  const { pickFromGallery, takePhoto } = useImagePicker();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<string>('MEDIUM');
  const [picked, setPicked] = useState<PickedImage[]>([]);
  const [busy, setBusy] = useState(false);
  /** ⚠️ §5 — the state that did not exist. Null while the form is up. */
  const [sent, setSent] = useState<{ issue: ShiftIssue | null; queued: boolean } | null>(null);

  const reset = useCallback(() => {
    setTitle('');
    setDescription('');
    setSeverity('MEDIUM');
    setPicked([]);
    setSent(null);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  // Opened with a report already written: put it in the fields, still editable.
  useEffect(() => {
    if (!visible) return;
    if (initialTitle) setTitle((cur) => cur || initialTitle);
    if (initialDescription) setDescription((cur) => cur || initialDescription);
  }, [visible, initialTitle, initialDescription]);

  const submit = useCallback(async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      // Saved on the phone first where there is an outbox; the issue and its photos send themselves.
      const files = offline.files; // starts with the engine — there whenever `write.run` queues
      const filed = keepCreated<Awaited<ReturnType<typeof reportIssueFromPhone>>>();
      const outcome = await write.run(
        (engine) =>
          filed.from(
            reportIssueFromPhone(engine, files!, {
              title: title.trim(),
              description: description.trim() || undefined,
              severity,
              timeEntryId,
              spaceId,
              photos: picked.map((p) => ({
                uri: p.uri,
                fileName: p.fileName,
                mimeType: p.mimeType,
                width: p.width,
                height: p.height,
              })),
            }),
          ),
        () =>
          shiftIssuesApi.create({
            title: title.trim(),
            description: description.trim() || undefined,
            severity,
            timeEntryId,
            spaceId,
          }),
      );
      if (outcome.kind === 'refused') {
        toast.error(
          t('common.error'),
          (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' })) ||
            outcome.message ||
            t('common.error'),
        );
        return;
      }
      if (filed.value) {
        const issueId = filed.value.issueId;
        /*
          ⚠️ OFFLINE GETS THE SAME SHEET, READING `Queued`. The app is
          offline-first and this form gave no indication at all: a member in a
          basement tapped Send, the sheet closed, and nothing said whether
          anybody would ever see it.
        */
        setSent({
          issue:
            outcome.kind === 'done'
              ? ({ id: issueId, title: title.trim(), severity, status: 'OPEN' } as ShiftIssue)
              : ({ id: issueId, title: title.trim(), severity, status: 'OPEN' } as ShiftIssue),
          queued: outcome.kind !== 'done',
        });
        return;
      }
      // Straight to the server: the photos follow the issue, as a message on it.
      const issue = (outcome.kind === 'done' ? outcome.response : null) as ShiftIssue;
      if (picked.length) {
        const attachments = await uploadPhotos(issue.id, picked);
        if (attachments.length) {
          try {
            await shiftIssuesApi.message(issue.id, { body: '', attachments });
          } catch {
            /* the issue is filed */
          }
        }
      }
      setSent({ issue, queued: false });
    } catch {
      /* the client reports its own failures */
    } finally {
      setBusy(false);
    }
  }, [title, description, severity, timeEntryId, spaceId, picked, write, offline.files, t, toast]);

  const addPhoto = useCallback(async () => {
    /*
      ⚠️ ONE BUTTON. The picker asks camera-or-library itself where the
      platform offers it; on a phone with no camera it simply opens the
      library, which is the right answer and not a second control.
    */
    const img = await takePhoto('issue-photo');
    if (img) {
      setPicked((p) => [...p, img].slice(0, MAX_PHOTOS));
      return;
    }
    const imgs = await pickFromGallery('issue-photo');
    if (imgs.length) setPicked((p) => [...p, ...imgs].slice(0, MAX_PHOTOS));
  }, [takePhoto, pickFromGallery]);

  return {
    amazen,
    t,
    c,
    title,
    setTitle,
    description,
    setDescription,
    severity,
    setSeverity,
    picked,
    setPicked,
    busy,
    sent,
    reset,
    close,
    submit,
    addPhoto,
  };
}
