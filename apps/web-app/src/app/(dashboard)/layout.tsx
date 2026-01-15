'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { DashboardSkeleton } from '@/components/skeletons';
import { useAuth } from '@/contexts/auth-context';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
    // Allow CLIENT and DISPATCHER roles only (TECHNICIAN uses mobile app)
    const allowedRoles = ['CLIENT', 'DISPATCHER'];
    if (!isLoading && isAuthenticated && user?.role && !allowedRoles.includes(user.role)) {
      router.push('/unauthorized');
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="mr-2 h-4 w-[1px] shrink-0 bg-border" />
        </header>
        <div className="flex flex-1 flex-col">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
