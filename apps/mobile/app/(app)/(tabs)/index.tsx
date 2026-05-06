import { useAuth } from '../../../src/contexts/auth-context';
import { AdminDashboard, FullTimeHome, FreelancerHome, HybridHome } from '../../../src/components/home';
<<<<<<< HEAD
import { Role, hasModule } from '@hbcfield/shared/client';
=======
import { Role, WorkMode } from '@hbcfield/shared/client';
>>>>>>> worktree-agent-a0600cc7

export default function HomeScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === Role.ADMIN;
  const isTechnician = user?.role === Role.TECHNICIAN;

  if (isAdmin) {
    return <AdminDashboard />;
  }

  if (isTechnician) {
    // HYBRID: show combined attendance + tasks home
    if (hasModule(user || {}, 'tasks') && hasModule(user || {}, 'clock')) {
      return <HybridHome />;
    }
    // ON_SITE full-time: attendance-focused home
<<<<<<< HEAD
    if (hasModule(user || {}, 'clock') && !hasModule(user || {}, 'tasks')) {
=======
    if (user?.workMode === WorkMode.ON_SITE) {
>>>>>>> worktree-agent-a0600cc7
      return <FullTimeHome />;
    }
  }

  // ON_ROAD / freelancer: task-focused home
  return <FreelancerHome />;
}
