import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/theme-context';
import { useAuth } from '@/contexts/auth-context';
import { useSocketContext } from '@/contexts/socket-context';
import { useTimeFormat } from '@/hooks/use-time-format';
import { useOffline, useSyncStatus } from '@/offline/offline-context';
import { pendingIssueEvents, sendIssueMessageFromPhone } from '@/offline/issues/issue-actions';
import { shiftIssuesApi, type ShiftIssue, type ShiftIssueEvent } from '@/lib/api/shift-issues';
import { useImagePicker, type PickedImage } from '@/hooks/use-image-picker';
import { BlurSheet } from '@/components/blur-sheet';
import { SheetPanel } from '@/components/sheet-panel';
import { AText, Chip, Eyebrow } from '@/components/amazen';
import { lookFor, offeredTo, readThread, severityShown, severityTone, type IssueActions, type ThreadEntry } from '../home/issue-status';
import { MAX_PHOTOS, uploadPhotos } from './photos';
import { personName } from '@hbcfield/shared/client';
import { useShiftIssueThreadSheet } from './use-shift-issue-thread-sheet';
import { ENDING_REASONS, Note, Bubble } from './shift-issue-thread-sheet-helpers';
import { ShiftIssueThreadSheetReasonOptional } from './shift-issue-thread-sheet-reason-optional';
import { ShiftIssueThreadSheetAddPhoto } from './shift-issue-thread-sheet-add-photo';
import { useShiftIssueThreadSheetLogic } from './use-shift-issue-thread-sheet-logic';
import { ShiftIssueThreadSheetClose } from './shift-issue-thread-sheet-close';

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
  const view = useShiftIssueThreadSheetLogic({ visible, onClose, issueId, canManage, currentUserId });
  const {
    vm,
    amazen,
    t,
    c,
    issue,
    failed,
    setFailed,
    picked,
    setPicked,
    viewing,
    setViewing,
    setEnding,
    scrollRef,
    load,
    thread,
    act,
    viewerId,
    offered,
    look,
    tone,
  } = view;

  return (
    <BlurSheet visible={visible} onClose={onClose}>
      <ShiftIssueThreadSheetClose view={view} onClose={onClose} />
    </BlurSheet>
  );
}
