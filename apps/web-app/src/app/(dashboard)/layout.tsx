'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { DashboardSkeleton, PageContentSkeleton } from '@/components/skeletons';
import { ErrorBoundary } from '@/components/error-boundary';
import { TopNavbar } from '@/components/top-navbar';
import { FirstSpaceGate } from '@/components/first-space-gate';
import { CommandPalette } from '@/components/command-palette';
import { ActivityPanelProvider } from '@/contexts/activity-panel-context';
import { CommandPaletteProvider } from '@/contexts/command-palette-context';
import { useAuth } from '@/contexts/auth-context';
import { getAccessPlatforms } from '@hbcfield/shared/client';
import { Smartphone } from 'lucide-react';
import { SocketProvider } from '@/contexts/socket-context';
import { BreadcrumbProvider } from '@/contexts/breadcrumb-context';
import { TokenDebugPanel } from '@/components/token-debug';
import { useRealtimeSync } from '@/hooks/use-realtime-sync';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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

  // Platform hard-block: a mobile-only Access Profile may not use the web portal.
  if (user && getAccessPlatforms(user) === 'mobile') {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
          <Smartphone className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-semibold text-slate-800">{t('common.mobileOnlyAccount')}</h1>
        <p className="max-w-sm text-sm text-slate-500">
          {t('common.mobileOnlyAccountBody')}
        </p>
      </div>
    );
  }

  return (
    <SocketProvider>
    <RealtimeSyncLayer />
    <ActivityPanelProvider>
    <CommandPaletteProvider>
    <BreadcrumbProvider>
      <div className="h-screen flex flex-col">
        <FirstSpaceGate />
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
      {/* Debug-only token countdown — hidden in production unless explicitly enabled */}
      {(process.env.NODE_ENV !== 'production' ||
        process.env.NEXT_PUBLIC_SHOW_TOKEN_MONITOR === 'true') && <TokenDebugPanel />}
    </BreadcrumbProvider>
    </CommandPaletteProvider>
    </ActivityPanelProvider>
    </SocketProvider>
  );
}
