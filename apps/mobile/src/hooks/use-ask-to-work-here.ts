import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/auth-context';
import { useToast } from '../island/island-context';
import { timeOffApi } from '../lib/api';
import { localDateKey } from '@hbcfield/shared/client';
import { draftToBody, type RequestBody } from '../components/requests/request-model';
import { useQueuedCreate } from '../offline/actions/queued-create';
import { uuidv7 } from '../offline/ids';

/**
 * "Ask to clock in from here" — a refusal for being away from the site turned
 * into the request the office already knows: a REMOTE ("work away") day for
 * today at that workspace. The same body, op and lane as Requests → Work away
 * (use-my-time-off.ts), so it is decided in Approvals like any other, and an
 * approved remote day is exactly what lets the next clock-in through.
 * No new route; nothing is assumed approved.
 */
export function useAskToWorkHere() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const create = useQueuedCreate<RequestBody>('timeOff.request');

  return useCallback(
    async (workspace: { id: string; name: string }) => {
      if (!user?.id) return;
      const built = draftToBody({ kind: 'REMOTE', startDate: localDateKey(new Date()), endDate: null, spaceId: workspace.id, reason: '' });
      if (!built.ok) {
        toast.error(t('common.error'), t(`requests.errors.${built.code}`, { defaultValue: t('timeOff.requestForm.failedToSubmit') }));
        return;
      }
      const id = uuidv7();
      const outcome = await create.run(
        { id, entityId: id, lane: `timeoff:${user.id}`, params: { employeeId: user.id }, body: built.body },
        () => timeOffApi.request(user.id, built.body),
      );
      if (outcome.kind === 'refused') {
        toast.error(
          t('common.error'),
          (outcome.code && t(`offline.errors.${outcome.code}`, { defaultValue: '' }))
            || outcome.message || t('timeOff.requestForm.failedToSubmit'),
        );
        return;
      }
      toast.info(t('clockSmart.askedTitle'), t('clockSmart.askedBody', { place: workspace.name }));
    },
    [user?.id, create, toast, t],
  );
}
