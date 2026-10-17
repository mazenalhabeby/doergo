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
import { useShiftIssueThreadSheet } from './use-shift-issue-thread-sheet';
import { ENDING_REASONS, Note, Bubble } from './shift-issue-thread-sheet-helpers';
import { ShiftIssueThreadSheetReasonOptional } from './shift-issue-thread-sheet-reason-optional';
import { ShiftIssueThreadSheetAddPhoto } from './shift-issue-thread-sheet-add-photo';

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
  const vm = useShiftIssueThreadSheet({ visible, onClose, issueId, canManage, currentUserId });
  const {
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
  } = vm;

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
            <ShiftIssueThreadSheetAddPhoto vm={vm} />

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
            <ShiftIssueThreadSheetReasonOptional vm={vm} />

          </>
        )}
      </SheetPanel>
    </BlurSheet>
  );
}
