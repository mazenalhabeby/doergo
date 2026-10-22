import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../island/island-context';
import { useQueuedWrite } from '../../offline/actions/queued-write';
import { useRefreshJobTime } from '../../hooks/useJobTime';
import { useRefreshMyHandovers } from '../../hooks/useMyHandovers';
import { changeLead, joinCrew, leaveCrew, reportMyIssue, resumeMine } from '../../offline/tasks/crew-actions';
import type { ActionOutcome } from '../../offline/actions/outcome';
import { tasksApi, type CrewView } from '../../lib/api';
import { refusalMessage } from './use-job-writes';

export type CrewMember = CrewView['members'][number];

/**
 * A crew on one job, from the phone (shared tasks/crew.ts). The view rides on
 * the job's time read; every action goes through the outbox where one exists
 * (the tap's own time, sent when there is signal), straight to the API where
 * it does not. The server decides — a refusal is said in its words.
 */
export function useCrew(taskId: string, view: CrewView | null | undefined, meId: string | null | undefined) {
  const { t } = useTranslation();
  const toast = useToast();
  const refreshJobTime = useRefreshJobTime();
  const refreshHandovers = useRefreshMyHandovers();
  const [busy, setBusy] = useState(false);

  const me = view?.members.find((m) => m.user.id === meId) ?? null;
  const isLeader = !!meId && view?.leader.userId === meId;
  const leader = view?.members.find((m) => m.user.id === view.leader.userId) ?? null;
  /** A crew: more than one person on the job. A job with one worker has no crew controls. */
  const isCrew = (view?.members.length ?? 0) > 1;
  /** Crew mode: somebody else moves the job's step — this phone does not offer it. */
  const stepsAreLeaders = !!view?.crewMode && isCrew && !!view.leader.userId && !isLeader;

  const write = useQueuedWrite();
  /** One crew action: through the outbox where there is one, straight to the API where there is not (`write.run`). */
  const act = useCallback(
    async (send: () => Promise<ActionOutcome>, done: string): Promise<boolean> => {
      setBusy(true);
      try {
        const outcome = await send();
        if (outcome.kind === 'refused') {
          toast.error(t('common.error'), refusalMessage(t, outcome));
          return false;
        }
        if (outcome.kind === 'queued') toast.info(t('offline.savedForLater'));
        else toast.success(done);
        refreshJobTime(taskId);
        refreshHandovers();
        return true;
      } catch (err) {
        toast.error(t('common.error'), err instanceof Error && err.message ? err.message : undefined);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [taskId, toast, t, refreshJobTime, refreshHandovers],
  );

  return {
    view: view ?? null,
    me,
    leader,
    isLeader,
    isCrew,
    stepsAreLeaders,
    busy,
    join: (viaLeaderStart = false) =>
      act(
        () =>
          write.run(
            (engine) => joinCrew(engine, taskId, viaLeaderStart),
            () => tasksApi.crew(taskId, 'join', viaLeaderStart ? { viaLeaderStart: true } : {}),
          ),
        t('job.crew.joined'),
      ),
    leave: () =>
      act(
        () =>
          write.run(
            (engine) => leaveCrew(engine, taskId),
            () => tasksApi.crew(taskId, 'leave'),
          ),
        t('job.crew.left'),
      ),
    reportMine: (reason: string) =>
      act(
        () =>
          write.run(
            (engine) => reportMyIssue(engine, taskId, reason),
            () => tasksApi.crew(taskId, 'issue', { reason }),
          ),
        t('job.crew.issueSent'),
      ),
    resumeMine: () =>
      act(
        () =>
          write.run(
            (engine) => resumeMine(engine, taskId),
            () => tasksApi.crew(taskId, 'resume'),
          ),
        t('job.crew.resumed'),
      ),
    handOver: (toUserId: string, scope: 'TODAY' | 'PERMANENT') =>
      act(
        () =>
          write.run(
            (engine) => changeLead(engine, taskId, { toUserId, scope }),
            () => tasksApi.changeLead(taskId, { toUserId, scope }),
          ),
        t('job.crew.leadHandedOver'),
      ),
  };
}

export type CrewControls = ReturnType<typeof useCrew>;
