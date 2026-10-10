import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/theme-context';
import { useAuth } from '../../contexts/auth-context';
import { useSocketContext } from '../../contexts/socket-context';
import { useTimeFormat } from '../../hooks/useTimeFormat';
import { useOffline, useSyncStatus } from '../../offline/offline-context';
import { pendingIssueEvents, sendIssueMessageFromPhone } from '../../offline/issues/issue-actions';
import { shiftIssuesApi, type ShiftIssue, type ShiftIssueEvent } from '../../lib/api/shift-issues';
import { useImagePicker, type PickedImage } from '../../hooks/useImagePicker';
import { BlurSheet } from '../blur-sheet';
import { SheetPanel } from '../sheet-panel';
import { AText, Chip, Eyebrow } from '../amazen';
import { lookFor, offeredTo, readThread, severityShown, severityTone, type IssueActions, type ThreadEntry } from '../home/issue-status';
import { MAX_PHOTOS, uploadPhotos } from './photos';
import { personName } from '@hbcfield/shared/client';

/**
 * ⚠️ THE TWO ENDINGS DO NOT SHARE A LIST. "Fixed on site" is not a reason to
 * withdraw something, and "Duplicate" is not a repair — one list would put
 * every wrong answer in front of both people. The web's six split four / two
 * along exactly that line.
 *
 * ⚠️ AND THEY ARE THE WEB'S OWN KEYS (`issues.resolveReasons`), already
 * written in five languages. A second list of the same six sentences is how
 * the phone and the desk end up disagreeing about what "Duplicate" means.
 */
const ENDING_REASONS = {
  resolve: ['fixedOnSite', 'partsUnavailable', 'needsSpecialist', 'customerUnavailable'],
  withdraw: ['duplicate', 'notAnIssue'],
} as const;

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
 * ⚠️ THE TRAIL IS THE OTHER HALF OF THE CONVERSATION. Every event with no
 * body drew nothing, so `ACKNOWLEDGED`, `ASSIGNED` and `REOPENED` — the
 * moments somebody actually picked the fault up — were invisible, and the
 * thread had silent gaps where the answer was. `readThread` turns each of
 * them into a centred line, the way the web has shown them all along.
 *
 * ⚠️ THE COMPOSER SURVIVES A RESOLVE, AND THE WEB'S DOES NOT. The web
 * replaces it with "This issue is resolved" and offers Reopen to managers
 * only — which strands the reporter the day the fault comes back, because the
 * phone is the only channel they have. `addMessage` on the server asks only
 * whether you are a participant, never the status, so the ability is real and
 * removing it here would be the client inventing a refusal.
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

  return (
    <BlurSheet visible={visible} onClose={onClose}>
      <SheetPanel onClose={onClose}>
        {/*
          ⚠️ A PHOTO IS SHOWN IN THE SHEET, NOT IN A MODAL OF ITS OWN. There
          is one Modal slot in this app — see `blur-sheet.tsx` — so a second
          `<Modal>` here would be refused by UIKit exactly the way the thread
          itself was, and tapping a photo would do nothing at all.
        */}
        {viewing ? (
          <Pressable
            onPress={() => setViewing(null)}
            accessibilityRole="button"
            accessibilityLabel={t('common.close', { defaultValue: 'Close' })}
            style={{ alignItems: 'center', gap: amazen.space(3) }}
          >
            <Image
              source={{ uri: viewing }}
              resizeMode="contain"
              style={{ width: '100%', height: 420, borderRadius: amazen.radius.tile, backgroundColor: c.sunken }}
            />
            <AText variant="caption" tone="accent">{t('common.close', { defaultValue: 'Close' })}</AText>
          </Pressable>
        ) : !issue ? (
          <View style={{ gap: amazen.space(3), paddingVertical: amazen.space(2) }}>
            <AText variant="caption" tone="muted">
              {failed
                ? t('issues.couldNotLoad', { defaultValue: 'We could not reach your issues. Try again in a moment.' })
                : t('common.loading', { defaultValue: 'Loading…' })}
            </AText>
            {failed ? (
              <Pressable onPress={() => { setFailed(false); void load(); }} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'flex-start' }}>
                <AText variant="caption" tone="accent">{t('common.retry', { defaultValue: 'Try again' })}</AText>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: amazen.space(2) }}>
              {severityShown(issue.severity) ? (
                <Chip
                  label={t(`issues.severity.${issue.severity}`, { defaultValue: issue.severity })}
                  tone={severityTone(issue.severity) ?? 'neutral'}
                />
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
                {/* ⚠️ The short label here — the name is in the conversation. */}
                {t(look?.label ?? 'issues.label.open', { defaultValue: issue.status })}
              </AText>
            </View>

            <AText variant="h3" tone="strong" style={{ marginTop: amazen.space(2) }}>{issue.title}</AText>
            {/*
              ⚠️ WHO, NOT WHAT — THE DESCRIPTION IS THE FIRST LINE OF THE TRAIL.
              It was printed here AND again as the `CREATED` event's body
              directly below, word for word. The caption's job is the context
              the conversation cannot carry: who raised it, and who it went to.
            */}
            <AText variant="caption" tone="muted" style={{ marginTop: 2 }}>
              {issue.assigneeName?.trim()
                ? t('issues.byAndTo', {
                    name: issue.reporterName || t('issues.aMember', { defaultValue: 'a member' }),
                    to: issue.assigneeName.trim(),
                    defaultValue: `Reported by ${issue.reporterName} · with ${issue.assigneeName.trim()}`,
                  })
                : t('issues.by', {
                    name: issue.reporterName || t('issues.aMember', { defaultValue: 'a member' }),
                    defaultValue: `Reported by ${issue.reporterName}`,
                  })}
            </AText>

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
                readThread(thread).map((entry) =>
                  entry.kind === 'message' ? (
                    <Bubble
                      key={entry.event.id}
                      event={entry.event}
                      mine={!!viewerId && entry.event.actorId === viewerId}
                      onOpenPhoto={setViewing}
                    />
                  ) : (
                    <Note key={entry.event.id} entry={entry} />
                  ),
                )
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
              ⚠️ THE QUIET ONE, UNDER THE COMPOSER. Ending the issue must not
              compete with the reply — a button beside it would make closing
              the conversation as loud as continuing it, and answering is the
              common act here.

              ⚠️ AND WHICH ENDING IS OFFERED IS THE SERVER'S ANSWER, NOT A
              GUESS. A plain reporter cannot resolve — the server refuses it —
              so they are offered the ending they DO have: withdraw it.
            */}
            {offered.resolve || offered.withdraw || offered.reopen ? (
              <Pressable
                onPress={() =>
                  offered.reopen
                    ? void act(() => shiftIssuesApi.setStatus(issue.id, 'IN_PROGRESS'))
                    : setEnding(offered.resolve ? 'resolve' : 'withdraw')
                }
                accessibilityRole="button"
                hitSlop={8}
                style={{ alignSelf: 'center', marginTop: amazen.space(3) }}
              >
                <AText variant="caption" tone="accent">
                  {offered.reopen
                    ? t('issues.reopen', { defaultValue: 'It is back — reopen it' })
                    : offered.resolve
                      ? t('issues.markResolved', { defaultValue: 'Fixed? Mark it resolved' })
                      : t('issues.withdraw', { defaultValue: 'Not an issue? Withdraw it' })}
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

            {/*
              ⚠️ THE REASON IS WHY THE TRAIL IS WORTH READING. "Resolved" on
              its own tells the reporter nothing; "Parts not available" tells
              them what to expect. The web offers the same six, because a
              tapped reason gets written and a typed one usually does not.

              ⚠️ AND IT IS OPTIONAL. The confirm is never gated on it — an
              ending somebody cannot reach without writing an essay is an
              ending they stop using.
            */}
            {ending ? (
              <View style={{ marginTop: amazen.space(4), gap: amazen.space(2) }}>
                <Eyebrow tone="muted">
                  {t('issues.reasonOptional', { defaultValue: 'Reason (optional)' })}
                </Eyebrow>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: amazen.space(2) }}>
                  {ENDING_REASONS[ending].map((k) => {
                    const label = t(`issues.resolveReasons.${k}`, { defaultValue: k });
                    const on = reason === label;
                    return (
                      <Pressable
                        key={k}
                        onPress={() => setReason(on ? '' : label)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={{
                          paddingHorizontal: amazen.space(3),
                          paddingVertical: amazen.space(2),
                          borderRadius: amazen.radius.full,
                          backgroundColor: c.tile,
                          borderWidth: 1.5,
                          borderColor: on ? c.inkStrong : 'transparent',
                        }}
                      >
                        <AText variant="caption" tone={on ? 'strong' : 'muted'}>{label}</AText>
                      </Pressable>
                    );
                  })}
                </View>
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  maxLength={400}
                  placeholder={t('issues.reasonPlaceholder', { defaultValue: 'Anything to add?' })}
                  placeholderTextColor={c.inkMuted}
                  style={{
                    backgroundColor: c.sunken,
                    borderRadius: amazen.radius.field,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: c.lineField,
                    paddingHorizontal: amazen.space(3),
                    paddingVertical: amazen.space(2.5),
                    color: c.inkStrong,
                    fontFamily: amazen.font.sans,
                    fontSize: 15,
                    height: 64,
                    textAlignVertical: 'top',
                  }}
                />
                <Pressable
                  onPress={() => {
                    const note = reason.trim() || undefined;
                    const to = ending === 'resolve' ? 'RESOLVED' : 'CANCELED';
                    setEnding(null); setReason('');
                    void act(() => shiftIssuesApi.setStatus(issue.id, to, note));
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    paddingVertical: amazen.space(3),
                    alignItems: 'center',
                    borderRadius: amazen.radius.full,
                    backgroundColor: c.accentSolid,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <AText variant="body" style={{ color: c.accentInk, fontFamily: amazen.font.sansMedium }}>
                    {ending === 'resolve'
                      ? t('issues.confirmResolve', { defaultValue: 'Mark it resolved' })
                      : t('issues.confirmWithdraw', { defaultValue: 'Withdraw it' })}
                  </AText>
                </Pressable>
                <Pressable
                  onPress={() => { setEnding(null); setReason(''); }}
                  accessibilityRole="button"
                  hitSlop={8}
                  style={{ alignSelf: 'center' }}
                >
                  <AText variant="caption" tone="muted">{t('shiftEnd.notYet', { defaultValue: 'Not yet' })}</AText>
                </Pressable>
              </View>
            ) : null}

          </>
        )}
      </SheetPanel>
    </BlurSheet>
  );
}

/**
 * SOMETHING HAPPENED — a centred line, and the reason under it when there is one.
 *
 * ⚠️ IT IS NOT A BUBBLE AND MUST NOT LOOK LIKE ONE. A system event styled as a
 * message from somebody is the read-receipt mistake in another shape: it
 * invites a reply to a sentence nobody wrote.
 */
function Note({ entry }: { entry: Extract<ThreadEntry, { kind: 'note' }> }) {
  const { amazen } = useTheme();
  const { t } = useTranslation();
  const c = amazen.color;
  const clockOf = useTimeFormat().formatTime;
  const when = new Date(entry.event.at);
  const time = Number.isNaN(when.getTime()) ? '' : clockOf(when);
  const line = t(entry.key, {
    name: entry.who,
    defaultValue: entry.who ? `${entry.who} updated this` : 'This was updated',
  });

  return (
    <View style={{ alignItems: 'center', marginBottom: amazen.space(3) }}>
      <View
        style={{
          maxWidth: '92%',
          alignItems: 'center',
          backgroundColor: c.tile,
          borderRadius: amazen.radius.full,
          paddingHorizontal: amazen.space(3),
          paddingVertical: amazen.space(1.5),
        }}
      >
        <AText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
          {`${line}${time ? ` · ${time}` : ''}`}
        </AText>
      </View>
      {/* ⚠️ Its own line — see `readThread`. */}
      {entry.reason ? (
        <AText variant="caption" tone="ink" style={{ marginTop: 4, maxWidth: '86%', textAlign: 'center' }}>
          {entry.reason}
        </AText>
      ) : null}
    </View>
  );
}

/** Yours on the right in accent-tint; theirs on the left on a sunken surface. */
function Bubble({ event, mine, onOpenPhoto }: { event: ShiftIssueEvent; mine: boolean; onOpenPhoto: (uri: string) => void }) {
  const { amazen } = useTheme();
  const c = amazen.color;
  /* The same clock as the card and the receipt — see `useTimeFormat`. */
  const clockOf = useTimeFormat().formatTime;
  const when = new Date(event.at);
  const time = Number.isNaN(when.getTime()) ? '' : clockOf(when);

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
        {/*
          ⚠️ A PDF IS NOT AN IMAGE. Every attachment was drawn through
          `<Image>`, so a document arrived as a 180×135 blank — the member is
          told a file is there and shown nothing. And a photo opens full
          screen: a thumbnail of a cracked weld is not evidence of anything.
        */}
        {event.attachments?.map((a) => {
          const uri = a.url ?? a.fileUrl;
          return (a.mimeType ?? '').startsWith('image/') ? (
            <Pressable
              key={a.id ?? a.fileUrl}
              onPress={() => onOpenPhoto(uri)}
              accessibilityRole="imagebutton"
              accessibilityLabel={a.fileName}
            >
              <Image source={{ uri }} style={{ width: 180, height: 135, borderRadius: amazen.radius.tile }} />
            </Pressable>
          ) : (
            <View
              key={a.id ?? a.fileUrl}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: amazen.space(2),
                backgroundColor: c.tile, borderRadius: amazen.radius.tile,
                paddingHorizontal: amazen.space(3), paddingVertical: amazen.space(2),
              }}
            >
              <AText variant="caption" tone="muted">▤</AText>
              <AText variant="caption" tone="ink" numberOfLines={1} style={{ flex: 1 }}>{a.fileName}</AText>
            </View>
          );
        })}
        {event.body ? <AText variant="body" tone="ink">{event.body}</AText> : null}
      </View>
      <AText variant="caption" tone="muted" style={{ marginTop: 2 }}>
        {`${event.actorName ?? ''} · ${time}`.trim()}
      </AText>
    </View>
  );
}
