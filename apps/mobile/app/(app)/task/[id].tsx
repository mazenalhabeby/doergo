import { useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { tasksApi, type Task } from '@/lib/api';
import { useQueuedWrite } from '@/offline/actions/queued-write';
import { changeTaskStatus } from '@/offline/tasks/task-actions';
import { takeStatusFix, outboxFix } from '@/offline/tasks/status-fix';
import { JobPage } from '@/features/job/job-page';
import { parseOpenSheet, type OpenSheet } from '@/features/job/job-logic';
import type { StatusExtras, WriteStatus } from '@/features/job/use-job-writes';

/**
 * The job — `docs/design/job-flow.html`. The page itself lives in
 * `src/components/job/`; this file is the route, the tablet pane, and the
 * one place a status change leaves the phone.
 *
 * Rendered two ways:
 *  - as the `/task/[id]` route (default export) → a slide-up panel over a blur
 *  - embedded in the Jobs tab's split view (`TaskDetailPane`, `embedded`)
 */

/**
 * ⚠️ THE ONE STATUS WRITE, for every step, Blocked and Cancel included — on
 * the job page AND on the Jobs tab's Next up card, which is handed this same
 * function by its route rather than writing a second status path.
 *
 * Through the outbox first — saved on the phone, sent when there is a
 * signal, a resend answered rather than repeated. The GPS fix is taken by
 * the ONE shared helper, the same as the home widget's, for the statuses the
 * server judges by where the member is standing. The direct call is only the
 * path for a build without the offline layer.
 *
 * A step with a form hands its answers in `extras` — the SAME write, so a move
 * that owes answers can never leave the phone by a second road.
 */
export function useWriteStatus(): WriteStatus {
  const write = useQueuedWrite();
  return useCallback(
    async (task: Task, newStatus: string, reason?: string, extras?: StatusExtras) => {
      const location = await takeStatusFix(newStatus);
      return write.run(
        (engine) =>
          changeTaskStatus(engine, {
            taskId: task.id,
            from: task.status,
            to: newStatus,
            reason,
            fix: outboxFix(location),
            // A step form's answers, and the queued photos/signatures they name — sent first.
            answers: extras?.answers,
            dependsOn: extras?.dependsOn,
          }),
        () => tasksApi.updateStatus(task.id, newStatus, reason, location, extras?.answers),
      );
    },
    [write],
  );
}

export function TaskDetailPane({
  taskId,
  embedded = false,
  onClose,
  initialSheet = null,
}: {
  taskId: string;
  embedded?: boolean;
  onClose?: () => void;
  /** Open on a sheet — `?sheet=form:<STEP>` from the Jobs tab's Next up card. */
  initialSheet?: OpenSheet | null;
}) {
  const writeStatus = useWriteStatus();
  return (
    <JobPage
      taskId={taskId}
      embedded={embedded}
      onClose={onClose}
      writeStatus={writeStatus}
      initialSheet={initialSheet}
    />
  );
}

// Route entry: reads the id from the URL and renders the pane as a slide-up panel.
export default function TaskDetailScreen() {
  const { id, sheet } = useLocalSearchParams<{ id: string; sheet?: string }>();
  return <TaskDetailPane taskId={id!} initialSheet={parseOpenSheet(sheet)} />;
}
