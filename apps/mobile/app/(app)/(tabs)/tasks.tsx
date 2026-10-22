import { JobsScreen } from '@/features/jobs-list/jobs-screen';
import { TaskDetailPane, useWriteStatus } from '../task/[id]';

/**
 * The Jobs tab — `docs/design/job-flow.html`, `renderJobs()`. The screen lives
 * in `src/components/jobs-list/`; this route hands it the two things that
 * belong to the job's own route:
 *
 *  - the ONE status write (`useWriteStatus`), so the Next up card moves a job
 *    exactly as the job page's dock does — outbox first, the shared GPS fix;
 *  - the tablet's right-hand pane (`TaskDetailPane`, embedded).
 */
export default function TasksScreen() {
  const writeStatus = useWriteStatus();
  return (
    <JobsScreen
      writeStatus={writeStatus}
      renderDetail={(taskId, sheet, close) => (
        <TaskDetailPane taskId={taskId} embedded onClose={close} initialSheet={sheet} />
      )}
    />
  );
}
