import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { useSocketContext } from '../../contexts/socket-context';
import { useOffline, useSyncStatus } from '../../offline/offline-context';
import { pendingIssueEvents, sendIssueMessageFromPhone } from '../../offline/issues/issue-actions';
import { shiftIssuesApi, type ShiftIssue, type ShiftIssueEvent } from '../../lib/api/shift-issues';
import { useImagePicker, type PickedImage } from '../../hooks/useImagePicker';
import { BlurSheet } from '../blur-sheet';
import { SheetPanel } from '../sheet-panel';
import { AText, Chip } from '../amazen';
import { lookFor, offeredTo, severityShown } from '../home/issue-status';
import { MAX_PHOTOS, uploadPhotos } from './photos';

/**
 * ONE ISSUE — THE THREAD.
 *
 * ⚠️ THE CONVERSATION IS THE FEATURE, AND IT WAS INVISIBLE. The detail sheet
 * showed a composer and nothing above it: the member who reported a seized
 * valve could type, and could not read the answer.
 *
 * ⚠️ THE REPORTER DOES NOT ACKNOWLEDGE (rule 11). Both *Acknowledge* and
 * *Resolve* used to appear as equal outline buttons whoever was looking, which
 * asks the person who filed a fault to acknowledge their own report. One sheet
 * serves both roles, so it has to know which one is looking — `offeredTo` in
 * `issue-status.ts` decides, and it is pure so the rule can be tested.
 *
 * ⚠️ RESOLVE DOES NOT COMPETE WITH THE REPLY. A text link under the composer,
 * not a button beside it: the common act here is answering.
 *
 * ⚠️ NO ✓ / ✓✓. That is a read-receipt metaphor — *delivered / read* — and
 * using it for *acknowledged / resolved* teaches the wrong thing about a
 * screen where the difference matters.
 *
 * ⚠️ ROUTING STAYS SERVER-SIDE (rule 12). Shift issues reach the workspace's
 * watchers, not every org admin — the mistake that once put the owner on every
 * late departure. Nothing in this sheet re-derives who should be here.
 */
export function ShiftIssueThreadSheet({
  visible,
  onClose,
  issueId,
  canManage,
  currentUserId,
}: {
  visible: boolean;
  onClose: () => void;
  issueId: string | null;
  canManage?: boolean;
  currentUserId?: string;
}) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const { user } = useAuth();
  const { subscribe } = useSocketContext();
  const { pickFromGallery, takePhoto } = useImagePicker();
  const offline = useOffline();
  const { operations } = useSyncStatus();

  const [issue, setIssue] = useState<ShiftIssue | null>(null);
  const [draft, setDraft] = useState('');
  const [picked, setPicked] = useState<PickedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!issueId) return;
    try { setIssue(await shiftIssuesApi.get(issueId)); } catch { /* the sheet keeps what it has */ }
  }, [issueId]);

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
  const thread = useMemo(() => {
    const server = issue?.thread ?? [];
    if (!issueId || !offline.files) return server;
    const known = new Set(server.map((e) => e.id));
    const files = offline.files;
    const mine = pendingIssueEvents(issueId, operations, (id, mime) => files.uriFor(id, mime), {
      id: user?.id ?? '',
      name: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(),
    }).filter((e) => !known.has(e.id));
    return [...server, ...mine];
  }, [issue?.thread, issueId, operations, offline.files, user?.id, user?.firstName, user?.lastName]);

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
  const offered = issue
    ? offeredTo({ issue, viewerId, canManage: !!canManage })
    : { acknowledge: false, resolve: false, reply: false };
  const look = issue ? lookFor(issue.status) : null;
  const tone = look?.tone === 'warn' ? c.warn : look?.tone === 'accent' ? c.accent : c.inkMuted;

  return (
    <BlurSheet visible={visible} onClose={onClose}>
      <SheetPanel onClose={onClose}>
        {!issue ? (
          <AText variant="caption" tone="muted">{t('common.loading', { defaultValue: 'Loading…' })}</AText>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
              {severityShown(issue.severity) ? (
                <Chip label={t(`issues.severity.${issue.severity}`, { defaultValue: issue.severity })} tone="warn" />
              ) : null}
              <View
                style={{
                  width: 8, height: 8, borderRadius: 4,
                  borderWidth: look?.solid ? 0 : 2,
                  borderColor: tone,
                  backgroundColor: look?.solid ? tone : 'transparent',
                }}
              />
              <AText variant="caption" tone="muted">
                {t(look?.readsAs ?? 'issues.reads.open', {
                  name: issue.assigneeName?.trim() ?? '',
                  defaultValue: issue.status,
                })}
              </AText>
            </View>

            <AText variant="h3" tone="strong" style={{ marginTop: amazen.space(2) }}>{issue.title}</AText>
            {issue.description ? (
              <AText variant="caption" tone="muted" style={{ marginTop: 2 }}>{issue.description}</AText>
            ) : null}

            <ScrollView
              ref={scrollRef}
              style={{ marginTop: amazen.space(4), maxHeight: 340 }}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
              showsVerticalScrollIndicator={false}
            >
              {thread.length === 0 ? (
                <AText variant="caption" tone="muted">
                  {t('issues.noReplyYet', { defaultValue: 'No reply yet.' })}
                </AText>
              ) : (
                thread.map((e) => <Bubble key={e.id} event={e} mine={!!viewerId && e.actorId === viewerId} />)
              )}
            </ScrollView>

            {picked.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: amazen.space(2) }}>
                {picked.map((p, i) => (
                  <Pressable
                    key={`${p.uri}:${i}`}
                    onPress={() => setPicked((prev) => prev.filter((_, idx) => idx !== i))}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.remove', { defaultValue: 'Remove' })}
                    style={{ marginRight: amazen.space(2) }}
                  >
                    <Image source={{ uri: p.uri }} style={{ width: 48, height: 48, borderRadius: amazen.radius.tile }} />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            {/* The composer: a photo, the reply, and send. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2), marginTop: amazen.space(3) }}>
              <Pressable
                onPress={addPhoto}
                accessibilityRole="button"
                accessibilityLabel={t('issues.addPhoto', { defaultValue: 'Add a photo' })}
                hitSlop={8}
                style={{
                  width: 40, height: 40, borderRadius: amazen.radius.full,
                  backgroundColor: c.tile, alignItems: 'center', justifyContent: 'center',
                }}
              >
                <AText variant="body" tone="ink">＋</AText>
              </Pressable>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={t('issues.replyPlaceholder', { defaultValue: 'Reply…' })}
                placeholderTextColor={c.inkMuted}
                multiline
                style={{
                  flex: 1,
                  backgroundColor: c.sunken,
                  borderRadius: amazen.radius.field,
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: c.lineField,
                  paddingHorizontal: amazen.space(3),
                  paddingVertical: amazen.space(2),
                  color: c.inkStrong,
                  fontFamily: amazen.font.sans,
                  fontSize: 15,
                  maxHeight: 96,
                }}
              />
              <Pressable
                onPress={() => void send()}
                disabled={busy || (!draft.trim() && picked.length === 0)}
                accessibilityRole="button"
                accessibilityLabel={t('issues.send', { defaultValue: 'Send' })}
                style={({ pressed }) => ({
                  width: 40, height: 40, borderRadius: amazen.radius.full,
                  backgroundColor: c.accentSolid, alignItems: 'center', justifyContent: 'center',
                  opacity: busy || (!draft.trim() && picked.length === 0) ? 0.4 : pressed ? 0.85 : 1,
                })}
              >
                <AText variant="body" style={{ color: c.accentInk }}>➤</AText>
              </Pressable>
            </View>

            {/*
              ⚠️ THE QUIET ONE, UNDER THE COMPOSER. Resolve must not compete
              with the reply — a button beside it would make ending the
              conversation as loud as continuing it.
            */}
            {offered.resolve ? (
              <Pressable
                onPress={() => void act(() => shiftIssuesApi.setStatus(issue.id, 'RESOLVED'))}
                accessibilityRole="button"
                hitSlop={8}
                style={{ alignSelf: 'center', marginTop: amazen.space(3) }}
              >
                <AText variant="caption" tone="accent">
                  {t('issues.markResolved', { defaultValue: 'Fixed? Mark it resolved' })}
                </AText>
              </Pressable>
            ) : null}

            {/* Only the responsible person, and only while it is OPEN. */}
            {offered.acknowledge ? (
              <Pressable
                onPress={() => void act(() => shiftIssuesApi.acknowledge(issue.id))}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  marginTop: amazen.space(3),
                  paddingVertical: amazen.space(3),
                  alignItems: 'center',
                  borderRadius: amazen.radius.full,
                  backgroundColor: c.accentSolid,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <AText variant="body" style={{ color: c.accentInk, fontFamily: amazen.font.sansMedium }}>
                  {t('issues.acknowledge', { defaultValue: 'Acknowledge' })}
                </AText>
              </Pressable>
            ) : null}
          </>
        )}
      </SheetPanel>
    </BlurSheet>
  );
}

/** Yours on the right in accent-tint; theirs on the left on a sunken surface. */
function Bubble({ event, mine }: { event: ShiftIssueEvent; mine: boolean }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const when = new Date(event.at);
  const time = Number.isNaN(when.getTime())
    ? ''
    : when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  if (!event.body && !(event.attachments?.length)) return null;

  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: amazen.space(3) }}>
      <View
        style={{
          maxWidth: '82%',
          backgroundColor: mine ? c.accentTint : c.sunken,
          borderRadius: amazen.radius.field,
          padding: amazen.space(3),
          gap: amazen.space(2),
        }}
      >
        {event.attachments?.map((a) => (
          <Image
            key={a.id ?? a.fileUrl}
            source={{ uri: a.url ?? a.fileUrl }}
            style={{ width: 180, height: 135, borderRadius: amazen.radius.tile }}
          />
        ))}
        {event.body ? <AText variant="body" tone="ink">{event.body}</AText> : null}
      </View>
      <AText variant="caption" tone="muted" style={{ marginTop: 2 }}>
        {`${event.actorName ?? ''} · ${time}`.trim()}
      </AText>
    </View>
  );
}
