import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { useSocketContext } from '../../contexts/socket-context';
import { useOffline, useSyncStatus } from '../../offline/offline-context';
import { pendingIssueEvents, sendIssueMessageFromPhone } from '../../offline/issues/issue-actions';
import { shiftIssuesApi, type ShiftIssue } from '../../lib/api/shift-issues';
import { useImagePicker, type PickedImage } from '../../hooks/useImagePicker';
import { lookFor, offeredTo, type IssueActions } from '../home/issue-status';
import { MAX_PHOTOS, uploadPhotos } from './photos';
import { personName } from '@hbcfield/shared/client';

/** ShiftIssueThreadSheet's state and handlers — everything before its markup, moved here unchanged. */
export function useShiftIssueThreadSheet({
  visible,
  onClose,
  issueId,
  canManage,
  currentUserId,
}: Pick<{
  visible: boolean;
  onClose: () => void;
  issueId: string | null;
  canManage?: boolean;
  currentUserId?: string;
}, 'visible' | 'onClose' | 'issueId' | 'canManage' | 'currentUserId'>) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const { user } = useAuth();
  const { subscribe } = useSocketContext();
  const { pickFromGallery, takePhoto } = useImagePicker();
  const offline = useOffline();
  const { operations } = useSyncStatus();

  const [issue, setIssue] = useState<ShiftIssue | null>(null);
  /* ⚠️ A failed read is not "still loading" — see `load`. */
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [picked, setPicked] = useState<PickedImage[]>([]);
  const [busy, setBusy] = useState(false);
  /* A photo opened full screen — a 180pt thumbnail of a cracked weld is not evidence. */
  const [viewing, setViewing] = useState<string | null>(null);
  /* `resolve` or `withdraw`, while the reason is being written. */
  const [ending, setEnding] = useState<'resolve' | 'withdraw' | null>(null);
  const [reason, setReason] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!issueId) return;
    try {
      setIssue(await shiftIssuesApi.get(issueId));
      setFailed(false);
    } catch {
      /*
        ⚠️ A FAILED READ USED TO LOOK EXACTLY LIKE A SLOW ONE. The catch was
        empty and the sheet rendered `Loading…` for as long as it was open, so
        a member whose request 404'd or timed out sat watching a spinner
        message with nothing to do about it — the same mistake the list sheet
        was fixed for. The sheet keeps whatever it already had; if it had
        nothing, it says so and offers the tap again.
      */
      setFailed(true);
    }
  }, [issueId]);

  /*
    ⚠️ AND THE PREVIOUS ISSUE GOES. `issue` survived a change of `issueId`, so
    opening a second fault showed the first one's title and thread until the
    read came back — on a slow connection, long enough to reply to the wrong
    one.
  */
  useEffect(() => { setIssue(null); setFailed(false); }, [issueId]);

  useEffect(() => { if (visible && issueId) void load(); }, [visible, issueId, load]);

  // Live: refresh the thread on any socket event for this issue.
  useEffect(() => {
    if (!visible || !issueId) return;
    const handler = (d: unknown) => {
      if ((d as { issueId?: string })?.issueId === issueId) void load();
    };
    const offs = [subscribe('shift_issue.event', handler), subscribe('shift_issue.created', handler)];
    return () => offs.forEach((o) => o());
  }, [visible, issueId, subscribe, load]);

  /* The server's thread, with what this phone has written and not yet sent on the end. */
  const myName = personName(user);
  const thread = useMemo(() => {
    const server = issue?.thread ?? [];
    if (!issueId || !offline.files) return server;
    const known = new Set(server.map((e) => e.id));
    const files = offline.files;
    const mine = pendingIssueEvents(issueId, operations, (id, mime) => files.uriFor(id, mime), {
      id: user?.id ?? '',
      name: myName,
    }).filter((e) => !known.has(e.id));
    return [...server, ...mine];
  }, [issue?.thread, issueId, operations, offline.files, user?.id, myName]);

  const send = useCallback(async () => {
    if (!issueId || (!draft.trim() && picked.length === 0)) return;
    setBusy(true);
    try {
      if (offline.engine && offline.files) {
        const outcome = await sendIssueMessageFromPhone(offline.engine, offline.files, {
          issueId,
          body: draft,
          photos: picked.map((p) => ({ uri: p.uri, fileName: p.fileName, mimeType: p.mimeType, width: p.width, height: p.height })),
        });
        if (outcome.kind === 'refused') return;
        setDraft(''); setPicked([]);
        if (outcome.kind === 'done') await load();
        return;
      }
      const attachments = picked.length ? await uploadPhotos(issueId, picked) : [];
      await shiftIssuesApi.message(issueId, { body: draft.trim(), attachments });
      setDraft(''); setPicked([]);
      await load();
    } catch { /* the client reports its own failures */ } finally { setBusy(false); }
  }, [issueId, draft, picked, load, offline.engine, offline.files]);

  const addPhoto = useCallback(async () => {
    const img = await takePhoto('issue-photo');
    if (img) { setPicked((p) => [...p, img].slice(0, MAX_PHOTOS)); return; }
    const imgs = await pickFromGallery('issue-photo');
    if (imgs.length) setPicked((p) => [...p, ...imgs].slice(0, MAX_PHOTOS));
  }, [takePhoto, pickFromGallery]);

  const act = useCallback(async (fn: () => Promise<unknown>) => {
    try { await fn(); await load(); } catch { /* the client reports its own failures */ }
  }, [load]);

  const viewerId = currentUserId ?? user?.id ?? null;
  const offered: IssueActions = issue
    ? offeredTo({ issue, viewerId, canManage: !!canManage })
    : { acknowledge: false, resolve: false, withdraw: false, reopen: false, reply: false };
  const look = issue ? lookFor(issue.status) : null;
  const tone = look?.tone === 'warn' ? c.warn : look?.tone === 'accent' ? c.accent : c.inkMuted;

  return {
    amazen,
    t,
    c,
    issue,
    failed,
    setFailed,
    draft,
    setDraft,
    picked,
    setPicked,
    busy,
    viewing,
    setViewing,
    ending,
    setEnding,
    reason,
    setReason,
    scrollRef,
    load,
    thread,
    send,
    addPhoto,
    act,
    viewerId,
    offered,
    look,
    tone,
  };
}

/** What ShiftIssueThreadSheet and its sections read. */
export type ShiftIssueThreadSheetState = ReturnType<typeof useShiftIssueThreadSheet>;
