import { useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { tasksApi, type Task } from '../../../src/lib/api';
import { useOffline } from '../../../src/offline/offline-context';
import { changeTaskStatus } from '../../../src/offline/tasks/task-actions';
import { takeStatusFix, outboxFix } from '../../../src/offline/tasks/status-fix';
import { JobPage } from '../../../src/components/job/job-page';

/**
 * The job — `docs/design/job-flow.html`. The page itself lives in
 * `src/components/job/`; this file is the route, the tablet pane, and the
 * one place a status change leaves the phone.
 *
 * Rendered two ways:
 *  - as the `/task/[id]` route (default export) → a slide-up panel over a blur
 *  - embedded in the Jobs tab's split view (`TaskDetailPane`, `embedded`)
 */
export function TaskDetailPane({
  taskId,
  embedded = false,
  onClose,
}: {
  taskId: string;
  embedded?: boolean;
  onClose?: () => void;
}) {
  const offline = useOffline();

  /*
    ⚠️ THE ONE STATUS WRITE, for every step, Blocked and Cancel included.

    Through the outbox first — saved on the phone, sent when there is a
    signal, a resend answered rather than repeated. The GPS fix is taken by
    the ONE shared helper, the same as the home widget's, for the statuses the
    server judges by where the member is standing. The direct call is only the
    path for a build without the offline layer.
  */
  const writeStatus = useCallback(async (task: Task, newStatus: string, reason?: string) => {
    const location = await takeStatusFix(newStatus);
    if (offline.engine) {
      return changeTaskStatus(offline.engine, {
        taskId: task.id,
        from: task.status,
        to: newStatus,
        reason,
        fix: outboxFix(location),
      });
    }
    const updated = await tasksApi.updateStatus(task.id, newStatus, reason, location);
    return { kind: 'done' as const, response: updated };
  }, [offline.engine]);

  return <JobPage taskId={taskId} embedded={embedded} onClose={onClose} writeStatus={writeStatus} />;
}

// Route entry: reads the id from the URL and renders the pane as a slide-up panel.
export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TaskDetailPane taskId={id!} />;
}
