import { Image, Pressable, ScrollView, View } from 'react-native';
import { shiftIssuesApi } from '@/lib/api/shift-issues';
import { SheetPanel } from '@/components/sheet-panel';
import { AText, Chip } from '@/components/amazen';
import { readThread, severityShown, severityTone } from '../home/issue-status';
import { Note, Bubble } from './shift-issue-thread-sheet-helpers';
import { ShiftIssueThreadSheetReasonOptional } from './shift-issue-thread-sheet-reason-optional';
import { ShiftIssueThreadSheetAddPhoto } from './shift-issue-thread-sheet-add-photo';
import type { ShiftIssueThreadSheetState } from './use-shift-issue-thread-sheet-logic';
import type { ShiftIssueThreadSheet } from './issue-thread-sheet';

/** Part of ShiftIssueThreadSheet's markup, moved here unchanged; it reads the page's state from `view`. */
export function ShiftIssueThreadSheetClose({
  view,
  onClose,
}: {
  view: ShiftIssueThreadSheetState;
  onClose: Parameters<typeof ShiftIssueThreadSheet>[0]['onClose'];
}) {
  const {
    viewing,
    setViewing,
    t,
    amazen,
    c,
    issue,
    failed,
    setFailed,
    load,
    look,
    tone,
    scrollRef,
    thread,
    viewerId,
    picked,
    setPicked,
    vm,
    offered,
    act,
    setEnding,
  } = view;
  return (
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
            <Pressable
              onPress={() => {
                setFailed(false);
                void load();
              }}
              accessibilityRole="button"
              hitSlop={8}
              style={{ alignSelf: 'flex-start' }}>
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
  );
}
