'use client';

import { personName } from '@hbcfield/shared/client';
import { kindEffectKey } from './request-model';
import type { useRequestDetailSheet } from './use-request-detail-sheet';
import type { RequestDetailSheet } from './request-parts';

/** What RequestDetailSheet works out after its early returns, moved here unchanged; called from the same place. */
export function RequestDetailSheetView({
  request,
  onClose,
  onWithdraw,
  t,
  toast,
  w,
  setBusy,
}: {
  request: NonNullable<Parameters<typeof RequestDetailSheet>[0]['request']>;
  onClose: Parameters<typeof RequestDetailSheet>[0]['onClose'];
  onWithdraw: Parameters<typeof RequestDetailSheet>[0]['onWithdraw'];
  t: ReturnType<typeof useRequestDetailSheet>['t'];
  toast: ReturnType<typeof useRequestDetailSheet>['toast'];
  w: ReturnType<typeof useRequestDetailSheet>['w'];
  setBusy: ReturnType<typeof useRequestDetailSheet>['setBusy'];
}) {
  const d = w.describe(request);
  const s = w.status(request);
  const waiting = request.status === 'PENDING';
  const who = request.approvedBy ? personName(request.approvedBy) : null;
  const effect = waiting ? kindEffectKey(d.kind) : null;

  const withdraw = async () => {
    if (!onWithdraw) return;
    setBusy(true);
    try {
      await onWithdraw(request);
      onClose();
    } catch (err) {
      toast.error(t('common.error'), err instanceof Error ? err.message : t('timeOff.failedToCancel'));
    } finally {
      setBusy(false);
    }
  };

  return { d, s, waiting, who, effect, withdraw };
}
