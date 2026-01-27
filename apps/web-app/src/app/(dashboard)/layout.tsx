'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { AppSidebar } from '@/components/app-sidebar';
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { DashboardSkeleton } from '@/components/skeletons';
import { TokenDisplay } from '@/components/token-display';
import { useAuth } from '@/contexts/auth-context';
import { BreadcrumbProvider, useBreadcrumbOverride } from '@/contexts/breadcrumb-context';

// Route labels for better breadcrumb display
const routeLabels: Record<string, string> = {
  'dashboard': 'Dashboard',
  'tasks': 'Tasks',
  'new': 'New Task',
  'edit': 'Edit',
  'technicians': 'Technicians',
  'map': 'Live Map',
  'settings': 'Settings',
  'invoices': 'Invoices',
};

// Breadcrumb navigation component (must be inside BreadcrumbProvider)
function BreadcrumbNav() {
  const pathname = usePathname();
  const { overrides } = useBreadcrumbOverride();

  const segments = pathname.split('/').filter(Boolean);

  const breadcrumbs = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/');

    // Check if there's an override for this segment
    if (overrides.has(segment)) {
      return { href, label: overrides.get(segment)! };
    }

    // Use predefined label or format the segment
    const label = routeLabels[segment] || segment
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

    return { href, label };
  });

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {breadcrumbs.map((crumb, index) => (
          <React.Fragment key={crumb.href}>
            <BreadcrumbItem>
              {index < breadcrumbs.length - 1 ? (
                <BreadcrumbLink asChild>
                  <Link href={crumb.href}>{crumb.label}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {index < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
    // Allow ADMIN and DISPATCHER roles only (TECHNICIAN uses mobile app)
    const allowedRoles = ['ADMIN', 'DISPATCHER'];
    if (!isLoading && isAuthenticated && user?.role && !allowedRoles.includes(user.role)) {
      router.push('/unauthorized');
    }
    // Check platform access (WEB or BOTH allowed)
    if (!isLoading && isAuthenticated && user?.platform) {
      const canAccessWeb = user.platform === 'WEB' || user.platform === 'BOTH';
      if (!canAccessWeb) {
        router.push('/unauthorized');
      }
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <BreadcrumbProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <BreadcrumbNav />
          </header>
          <div className="flex flex-1 flex-col overflow-auto bg-slate-50/50">
            {children}
          </div>
        </SidebarInset>
        <TokenDisplay />
      </SidebarProvider>
    </BreadcrumbProvider>
  );
}
