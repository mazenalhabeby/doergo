'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
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
import { NotificationBell } from '@/components/notification-bell';
import { ThemeToggle } from '@/components/theme-toggle';
import { useAuth } from '@/contexts/auth-context';
import { SocketProvider } from '@/contexts/socket-context';
import { BreadcrumbProvider, useBreadcrumbOverride } from '@/contexts/breadcrumb-context';

// ---------------------------------------------------------------------------
// Route-change progress bar — shows a slim animated bar at the top of the
// content area while a new page is loading.
// ---------------------------------------------------------------------------
function RouteChangeIndicator() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [prevPath, setPrevPath] = useState(pathname);

  useEffect(() => {
    if (pathname !== prevPath) {
      // Route changed — hide the bar
      setLoading(false);
      setPrevPath(pathname);
    }
  }, [pathname, prevPath]);

  // Intercept clicks on <a> tags inside the sidebar / layout to detect
  // navigation *before* the route actually changes.
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('#')) return;
      // Only trigger if navigating to a different path
      if (href !== pathname && href !== pathname + '/') {
        setLoading(true);
      }
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [pathname]);

  if (!loading) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-[3px]">
      <div className="h-full bg-blue-600 animate-progress-bar rounded-r-full" />
    </div>
  );
}

// Fallback skeleton for Suspense boundary
function ContentFallback() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-8 w-64 bg-slate-200 rounded-lg" />
      <div className="h-4 w-48 bg-slate-100 rounded-lg" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 bg-white rounded-xl border border-slate-200/80" />
        ))}
      </div>
      <div className="h-64 bg-white rounded-xl border border-slate-200/80 mt-4" />
    </div>
  );
}

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
    <SocketProvider>
    <BreadcrumbProvider>
      <SidebarProvider>
        <RouteChangeIndicator />
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <BreadcrumbNav />
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
              <NotificationBell />
            </div>
          </header>
          <div className="flex flex-1 flex-col overflow-auto bg-slate-50/50 dark:bg-background">
            <Suspense fallback={<ContentFallback />}>
              {children}
            </Suspense>
          </div>
        </SidebarInset>
        {/* <TokenDisplay /> */}
      </SidebarProvider>
    </BreadcrumbProvider>
    </SocketProvider>
  );
}
