import { useAuth } from '../../../src/contexts/auth-context';
import { AdminDashboard, FullTimeHome, FreelancerHome, HybridHome } from '../../../src/components/home';
import { Role, hasModule, normalizeRole } from '@hbcfield/shared/client';

export default function HomeScreen() {
  const { user } = useAuth();
  // Normalize so legacy role names (CLIENT/DISPATCHER/TECHNICIAN) and canonical
  // ones (ADMIN/MANAGER/EMPLOYEE) both resolve correctly.
  const role = normalizeRole(user?.role || '');
  const isAdmin = role === Role.ADMIN;
  const isEmployee = role === Role.EMPLOYEE;

  if (isAdmin) {
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
