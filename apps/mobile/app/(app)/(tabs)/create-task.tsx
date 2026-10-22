import { NewJobScreen } from '@/features/new-job/new-job-screen';

/**
 * New job — `docs/design/job-flow.html`, `renderCreate()`. The screen, its
 * rules and its send live in `src/components/new-job/`.
 *
 * ⚠️ THE ROUTE NAME STAYS `create-task`: the tab bar, the overflow sheet
 * (`tab-overflow.spec`), the client record's "New job" and every shortcut
 * already point here.
 */
export default function CreateTaskScreen() {
  return <NewJobScreen />;
}
