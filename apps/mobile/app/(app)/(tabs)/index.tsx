import { useAuth } from '../../../src/contexts/auth-context';
import { AdminDashboard, FullTimeHome, FreelancerHome } from '../../../src/components/home';
import { Role } from '@hbcfield/shared/client';

export default function HomeScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === Role.ADMIN;
  const isTechnician = user?.role === Role.TECHNICIAN;
  const isFullTimeTechnician = isTechnician && user?.technicianType === 'FULL_TIME';

  if (isAdmin) {
    return <AdminDashboard />;
  }

  if (isFullTimeTechnician) {
    return <FullTimeHome />;
  }

  return <FreelancerHome />;
}
