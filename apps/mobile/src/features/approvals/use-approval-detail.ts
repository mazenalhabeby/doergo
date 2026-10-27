import { useCallback, useEffect, useState } from 'react';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  durationFieldsOf,
  durationMinutes,
  type ApprovalActionSpec,
  type ApprovalItem,
  type DurationFields,
  type NoShowExcuseReason,
} from '@hbcfield/shared/client';
import { useTheme } from '@/contexts/theme-context';
import { useToast } from '@/island/island-context';
import { approvalsApi } from '@/lib/api';
import { useResponsive } from '@/lib/responsive';
import { centeredContent } from '@/components/screen-container';
import { forgetApproval, knownApproval, loadApprovals } from './approvals-store';
import { refusalText } from '@/lib/distance';

/** ApprovalDetail's state and handlers — everything before its markup, moved here unchanged. */
export function useApprovalDetail({ itemKey }: Pick<{ itemKey: string }, 'itemKey'>) {
  const { amazen } = useTheme();
  const c = amazen.color;
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const r = useResponsive();
  const wide = r.isTablet ? centeredContent(720) : null;

  const [item, setItem] = useState<ApprovalItem | null>(knownApproval(itemKey));
  const [missing, setMissing] = useState(false);
  const [armed, setArmed] = useState<ApprovalActionSpec | null>(null);
  const [reason, setReason] = useState('');
  // The time a decision counts, as the two fields hold it (hours + minutes).
  const [duration, setDuration] = useState<DurationFields>(durationFieldsOf(30));
  const [expiresOn, setExpiresOn] = useState('');
  // A missed shift: what happened, and whether the answer covers its whole run of days.
  const [reasonCode, setReasonCode] = useState<NoShowExcuseReason>('SICK');
  const [wholeRun, setWholeRun] = useState(true);
  const [busy, setBusy] = useState(false);

  // Opened from a link, or after the list moved on: read it again.
  useEffect(() => {
    if (item) return;
    loadApprovals()
      .then(() => {
        const hit = knownApproval(itemKey);
        if (hit) setItem(hit);
        else setMissing(true);
      })
      .catch(() => setMissing(true));
  }, [item, itemKey]);

  // The form starts from the item's own values — on load, and every time a decision sheet opens.
  const resetInputs = useCallback((it: ApprovalItem | null) => {
    const d = (it?.data ?? {}) as Record<string, unknown>;
    setDuration(durationFieldsOf(typeof d.requestedMinutes === 'number' ? d.requestedMinutes : 30));
    setExpiresOn(typeof d.expiresOn === 'string' ? d.expiresOn.slice(0, 10) : '');
  }, []);
  useEffect(() => resetInputs(item), [item, resetInputs]);

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/(app)/approvals' as Href));

  const decide = useCallback(
    async (a: ApprovalActionSpec) => {
      if (!item) return;
      setBusy(true);
      try {
        const res = await approvalsApi.decide({
          kind: item.kind,
          id: item.id,
          action: a.id,
          reason: a.reason !== 'none' && reason.trim() ? reason.trim() : undefined,
          minutes: a.input === 'minutes' ? (durationMinutes(duration) ?? undefined) : undefined,
          expiresOn: a.input === 'expiresOn' && expiresOn ? expiresOn : undefined,
          reasonCode: a.input === 'excuseReason' ? reasonCode : undefined,
          wholeRun: runCount > 1 && wholeRun ? true : undefined,
          spaceId:
            item.kind === 'clientRequest'
              ? (item.space?.id ?? (item.data.suggestedSpaceId as string | undefined))
              : undefined,
        });
        if (res.stage === 'FIRST_STEP') {
          // Step 1 of 2: theirs is in; the item stays in the list, now waiting for the second person.
          toast.success(t('approvals.step.firstDone', { role: res.waitingFor ?? '' }));
        } else {
          forgetApproval(itemKey);
          toast.success(t('approvals.decided', { name: item.subject.name || t('approvals.someone') }));
        }
        setArmed(null);
        back();
      } catch (e: unknown) {
        // A coded refusal (CHANGED_MEANWHILE, OVERTIME_ALREADY_DECIDED, …) in the reader's words.
        toast.error(refusalText(t, (e ?? {}) as { code?: string; message?: string }, t('approvals.loadFailed')));
      } finally {
        setBusy(false);
      }
    },
    [item, itemKey, reason, duration, expiresOn, reasonCode, wholeRun, toast, t],
  ); // eslint-disable-line react-hooks/exhaustive-deps

  const runCount = typeof item?.data.runCount === 'number' ? item.data.runCount : 0;
  const press = (a: ApprovalActionSpec) => {
    // A run of missed days asks first whether the answer covers all of them.
    if (a.reason !== 'none' || a.input || runCount > 1) {
      setReason('');
      setReasonCode('SICK');
      setWholeRun(true);
      resetInputs(item);
      setArmed(a);
    } else void decide(a);
  };

  return {
    amazen,
    c,
    t,
    i18n,
    wide,
    item,
    missing,
    armed,
    setArmed,
    reason,
    setReason,
    duration,
    setDuration,
    expiresOn,
    setExpiresOn,
    reasonCode,
    setReasonCode,
    wholeRun,
    setWholeRun,
    busy,
    back,
    decide,
    runCount,
    press,
  };
}
