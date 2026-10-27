import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  approvalWebPath,
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
import { resolveWebOrigin } from '@/lib/api/base-url';
import { urlEnvironment } from '@/lib/api/url-environment';

/** A refusal that means the item moved on (decided, routed, changed) — the screen reads it again, never retries. */
const STALE_CODES = new Set(['CHANGED_MEANWHILE', 'TIME_OFF_DECIDED', 'REQUEST_ALREADY_ROUTED']);
export function isStaleRefusal(e: { status?: number; code?: string } | null | undefined): boolean {
  const code = e?.code ?? '';
  return e?.status === 404 || e?.status === 409 || STALE_CODES.has(code) || code.endsWith('_ALREADY_DECIDED');
}

/** ApprovalDetail's state and handlers: the item, the decision form, the one decision in flight. */
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
  // One decision at a time: a second tap before the first answer never sends again.
  const sending = useRef(false);

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
    // An earlier approver's agreed time comes first: the smallest agreed time counts, so a default would cut it.
    const agreed = it?.step?.agreedMinutes;
    const start = typeof agreed === 'number' && agreed > 0 ? agreed : d.requestedMinutes;
    setDuration(durationFieldsOf(typeof start === 'number' ? start : 30));
    setExpiresOn(typeof d.expiresOn === 'string' ? d.expiresOn.slice(0, 10) : '');
  }, []);
  useEffect(() => resetInputs(item), [item, resetInputs]);

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/(app)/approvals' as Href));

  const decide = useCallback(
    async (a: ApprovalActionSpec) => {
      if (!item || sending.current) return;
      sending.current = true;
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
        const err = (e ?? {}) as { status?: number; code?: string; message?: string };
        toast.error(refusalText(t, err, t('approvals.loadFailed')));
        if (isStaleRefusal(err)) {
          // The item moved on: read the inbox again — fresh facts and buttons, or "already decided".
          setArmed(null);
          await loadApprovals()
            .then(() => {
              const fresh = knownApproval(itemKey);
              if (fresh) setItem(fresh);
              else setMissing(true);
            })
            .catch(() => setMissing(true));
        }
      } finally {
        sending.current = false;
        setBusy(false);
      }
    },
    [item, itemKey, reason, duration, expiresOn, reasonCode, wholeRun, toast, t],
  ); // eslint-disable-line react-hooks/exhaustive-deps

  // The full page on the web, for a decision the phone has no form for (null: no web app configured).
  const webUrl = useMemo(() => {
    const origin = resolveWebOrigin(urlEnvironment());
    return origin && item ? origin + approvalWebPath(item) : null;
  }, [item]);
  const openWeb = () => {
    if (webUrl) void Linking.openURL(webUrl).catch(() => undefined);
  };

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
    webUrl,
    openWeb,
  };
}
