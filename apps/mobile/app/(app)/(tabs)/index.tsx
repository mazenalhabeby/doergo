import { useAuth } from '../../../src/contexts/auth-context';
import { AdminDashboard, FullTimeHome, FreelancerHome, HybridHome } from '../../../src/components/home';
import { Role, WorkMode, TechnicianType } from '@hbcfield/shared/client';

export default function HomeScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === Role.ADMIN;
  const isTechnician = user?.role === Role.TECHNICIAN;

  if (isAdmin) {
    return <AdminDashboard />;
  }

  if (isTechnician) {
    // HYBRID: show combined attendance + tasks home
    if (user?.workMode === WorkMode.HYBRID) {
      return <HybridHome />;
    }
    // ON_SITE full-time: attendance-focused home
    if (user?.workMode === WorkMode.ON_SITE && user?.technicianType === TechnicianType.FULL_TIME) {
      return <FullTimeHome />;
    }
  }

  // ON_ROAD / freelancer: task-focused home
  return <FreelancerHome />;
}
