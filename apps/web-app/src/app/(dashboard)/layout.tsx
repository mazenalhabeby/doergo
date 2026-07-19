'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { DashboardSkeleton, PageContentSkeleton } from '@/components/skeletons';
import { ErrorBoundary } from '@/components/error-boundary';
import { TopNavbar } from '@/components/top-navbar';
import { FirstSpaceGate } from '@/components/first-space-gate';
import { BillingBanner } from '@/components/billing-banner';
import { CommandPalette } from '@/components/command-palette';
import { ActivityPanelProvider } from '@/contexts/activity-panel-context';
import { CommandPaletteProvider } from '@/contexts/command-palette-context';
import { useAuth } from '@/contexts/auth-context';
import { getAccessPlatforms } from '@hbcfield/shared/client';
import { Smartphone, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SocketProvider } from '@/contexts/socket-context';
import { BreadcrumbProvider } from '@/contexts/breadcrumb-context';
import { TokenDebugPanel } from '@/components/token-debug';
import { useRealtimeSync } from '@/hooks/use-realtime-sync';
import { SupportWidget } from '@/components/support/support-widget';
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
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    // A signed-in user with no organization yet (orphan) must finish onboarding
    // before entering the app — create an org, join by code, or accept an invite.
    if (user?.onboardingCompleted === false) {
      router.replace('/onboarding');
    }
  }, [isLoading, isAuthenticated, user?.onboardingCompleted, router]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (!isAuthenticated) {
    return null;
  }

  // Orphan user (no organization yet) — the effect above redirects them to
  // /onboarding. Don't render the dashboard in the meantime, so we don't flash
  // its chrome or fire org-scoped data fetches for a user who has no org.
  if (user?.onboardingCompleted === false) {
    return <DashboardSkeleton />;
  }

  // Platform hard-block: a mobile-only Access Profile may not use the web portal.
  if (user && getAccessPlatforms(user) === 'mobile') {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Smartphone className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">{t('common.mobileOnlyAccount')}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {t('common.mobileOnlyAccountBody')}
        </p>
        <Button variant="outline" className="mt-2" onClick={() => logout()}>
          <LogOut className="mr-2 h-4 w-4" />
          {t('nav.userMenu.signOut')}
        </Button>
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
        <BillingBanner />
        <div className="flex-1 overflow-auto bg-background">
          <ErrorBoundary>
            <Suspense fallback={<PageContentSkeleton />}>
              {children}
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
      <CommandPalette />
      <SupportWidget />
      {/* Debug-only token countdown — hidden in production unless explicitly enabled */}
      {(process.env.NODE_ENV !== 'production' ||
        process.env.NEXT_PUBLIC_SHOW_TOKEN_MONITOR === 'true') && <TokenDebugPanel />}
    </BreadcrumbProvider>
    </CommandPaletteProvider>
    </ActivityPanelProvider>
    </SocketProvider>
  );
}
