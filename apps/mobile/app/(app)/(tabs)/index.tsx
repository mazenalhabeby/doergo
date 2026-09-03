import { useAuth } from '../../../src/contexts/auth-context';
import { AdminDashboard, FullTimeHome, FreelancerHome, HybridHome } from '../../../src/components/home';
import { Role, hasModule, normalizeRole } from '@hbcfield/shared/client';
import { oversees } from '../../../src/lib/permissions';

export default function HomeScreen() {
  const { user } = useAuth();
  // Normalize so legacy role names (CLIENT/DISPATCHER/TECHNICIAN) and canonical
  // ones (ADMIN/MANAGER/EMPLOYEE) both resolve correctly.
  const role = normalizeRole(user?.role || '');
  const isEmployee = role === Role.EMPLOYEE;

  /*
    Overseeing, not doing.

    This asked `role === ADMIN`, so a Space Manager or a client's supervisor —
    people who hold real authority through a SPACE role and are not admins —
    landed on a field worker's home: a clock card and their own task list, for
    somebody who executes nothing. The lists behind the oversight view are
    already narrowed to the spaces they hold, so it shows their site rather than
    the organization.
  */
  if (oversees(user)) {
    return <AdminDashboard />;
  }

  if (isEmployee) {
    // The home variant is driven by the worker's enabled modules:
    // HYBRID — combined attendance + tasks
    if (hasModule(user || {}, 'tasks') && hasModule(user || {}, 'clock')) {
      return <HybridHome />;
    }
    // ON_SITE — attendance/clock-focused
    if (hasModule(user || {}, 'clock') && !hasModule(user || {}, 'tasks')) {
      return <FullTimeHome />;
    }
    // ON_ROAD / default — task-focused
    return <FreelancerHome />;
  }

  // MANAGER and anyone else fall back to the task-focused home.
  return <FreelancerHome />;
}
