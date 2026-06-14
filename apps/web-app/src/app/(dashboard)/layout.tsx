'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { DashboardSkeleton, PageContentSkeleton } from '@/components/skeletons';
import { ErrorBoundary } from '@/components/error-boundary';
import { TopNavbar } from '@/components/top-navbar';
import { CommandPalette } from '@/components/command-palette';
import { ActivityPanelProvider } from '@/contexts/activity-panel-context';
import { CommandPaletteProvider } from '@/contexts/command-palette-context';
import { useAuth } from '@/contexts/auth-context';
import { SocketProvider } from '@/contexts/socket-context';
import { BreadcrumbProvider } from '@/contexts/breadcrumb-context';
import { TokenDebugPanel } from '@/components/token-debug';
import { useRealtimeSync } from '@/hooks/use-realtime-sync';

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


/** Invisible component that runs inside SocketProvider to sync all real-time events */
function RealtimeSyncLayer() {
  useRealtimeSync();
  return null;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SocketProvider>
    <RealtimeSyncLayer />
    <ActivityPanelProvider>
    <CommandPaletteProvider>
    <BreadcrumbProvider>
      <div className="h-screen flex flex-col">
        <RouteChangeIndicator />
        <TopNavbar />
        <div className="flex-1 overflow-auto bg-background">
          <ErrorBoundary>
            <Suspense fallback={<PageContentSkeleton />}>
              {children}
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
      <CommandPalette />
      <TokenDebugPanel />
    </BreadcrumbProvider>
    </CommandPaletteProvider>
    </ActivityPanelProvider>
    </SocketProvider>
  );
}
