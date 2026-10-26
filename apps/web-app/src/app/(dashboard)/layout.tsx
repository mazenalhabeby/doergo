"use client"

import { useEffect, useState, Suspense, type ReactNode } from "react"
import { BootScreen } from "@/components/skeletons/boot-screen"
import { useRouter, usePathname } from "next/navigation"
import { PageContentSkeleton } from "@/components/skeletons"
import { ErrorBoundary } from "@/components/app-shell/error-boundary"
import { TopBar } from "@/components/app-shell/top-bar"
import { Sidebar } from "@/components/app-shell/sidebar/sidebar"
import { FirstSpaceGate } from "@/components/app-shell/first-space-gate"
import { BillingBanner } from "@/components/app-shell/billing-banner"
import { CommandPalette } from "@/components/command-palette/command-palette"
import { ActivityPanelProvider } from "@/contexts/activity-panel-context"
import { CommandPaletteProvider } from "@/contexts/command-palette-context"
import { useAuth } from "@/contexts/auth-context"
import { getAccessPlatforms } from "@hbcfield/shared/client"
import { Smartphone, LogOut, Building2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SocketProvider } from "@/contexts/socket-context"
import { BreadcrumbProvider } from "@/contexts/breadcrumb-context"
import { TokenDebugPanel } from "@/components/app-shell/token-debug"
import { useRealtimeSync } from "@/hooks/use-realtime-sync"
import { ChatProvider } from "@/components/chat/chat-provider"
import { TourProvider } from "@/components/tour"
import { MobileAppInterstitial } from "@/components/app-shell/mobile-app-interstitial"
import { StoreBadges } from "@/components/marketing/store-badges"
import { useTranslation } from "react-i18next"
import { NoPageAccess } from "@/components/app-shell/no-page-access"
import { useRouteAccess } from "@/hooks/use-route-access"

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
      <div className="h-full bg-shell-accent animate-progress-bar rounded-r-full" />
    </div>
  );
}


/** The page in ONE rounded panel on the shell's ground (full-bleed below lg). */
const PAGE_PANEL =
  "relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background " +
  "lg:rounded-[26px] lg:border lg:border-shell-line lg:shadow-shell"

/** Invisible component that runs inside SocketProvider to sync all real-time events */
function RealtimeSyncLayer() {
  useRealtimeSync();
  return null;
}

/** A signed-in account this web shell is not for: what it is, the apps, and the way out. */
function AccountBlockScreen({ icon, title, body, signOutLabel, onSignOut }: {
  icon: ReactNode
  title: string
  body: string
  signOutLabel: string
  onSignOut: () => void
}) {
  return (
    <div className="h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </div>
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      <StoreBadges size="sm" className="mt-2 justify-center" />
      <Button variant="outline" className="mt-2" onClick={onSignOut}>
        <LogOut className="mr-2 h-4 w-4" />
        {signOutLabel}
      </Button>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const routeAccess = useRouteAccess();

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

  /*
    Who you are is not known yet — so neither screen is safe to draw.

    This showed the dashboard skeleton: a navbar and a grid of cards, which is a
    fair guess for somebody signed in and a picture of an application they cannot
    enter for everybody else, replaced a moment later by the login page. Signing
    out gave the same flash in reverse.
  */
  if (isLoading) {
    return <BootScreen />;
  }

  /*
    Signed out, and the redirect above is on its way.

    `null` here meant a blank white screen between the loading state and the
    login page — so the sequence was skeleton, then nothing, then login. The same
    boot screen holds it steady until the navigation lands.
  */
  if (!isAuthenticated) {
    return <BootScreen />;
  }

  // Orphan user (no organization yet) — the effect above redirects them to
  // /onboarding. Don't render the dashboard in the meantime, so we don't flash
  // its chrome or fire org-scoped data fetches for a user who has no org.
  if (user?.onboardingCompleted === false) {
    // Also on the way OUT of the dashboard — to /onboarding, which does not look
    // like the dashboard either.
    return <BootScreen />;
  }

  /*
    A CLIENT account on the staff shell. The CUSTOMER role belongs to the client
    app (the portal on the phone); here every request is refused by the
    CustomerConfinement guard, so the shell rendered as a broken, empty app.
    Same block as the mobile-only one — say what this account is for, and the
    way out.
  */
  if (user && String(user.role).toUpperCase() === 'CUSTOMER') {
    return (
      <AccountBlockScreen
        icon={<Building2 className="h-8 w-8" />}
        title={t('common.clientAccount')}
        body={t('common.clientAccountBody')}
        signOutLabel={t('nav.userMenu.signOut')}
        onSignOut={() => logout()}
      />
    );
  }

  // Platform hard-block: a mobile-only Access Profile may not use the web portal.
  if (user && getAccessPlatforms(user) === 'mobile') {
    return (
      <AccountBlockScreen
        icon={<Smartphone className="h-8 w-8" />}
        title={t('common.mobileOnlyAccount')}
        body={t('common.mobileOnlyAccountBody')}
        signOutLabel={t('nav.userMenu.signOut')}
        onSignOut={() => logout()}
      />
    );
  }

  /*
    The page itself, or a plain "no access" in its place.

    Asked of ONE table (lib/route-access) that mirrors the gateway guard behind
    each page. Rendering the refusal INSTEAD of the page means the page never
    mounts, so none of its queries go out to come back 403 — the shell used to
    draw in full around a column of refusals for any URL somebody typed.
  */
  const verdict = routeAccess.check(pathname);
  const page = verdict.ok ? children : <NoPageAccess reason={verdict.reason} />;

  return (
    <SocketProvider>
    <RealtimeSyncLayer />
    <ActivityPanelProvider>
    <CommandPaletteProvider>
    <BreadcrumbProvider>
    <ChatProvider>
    <TourProvider>
      {/*
        The shell (web redesign, 2026-10): the sidebar on the green ground, the page in ONE rounded panel.
        Below lg the sidebar is a drawer behind the top bar's menu button and the panel fills the screen.
      */}
      <div className="flex h-dvh bg-shell-ground bg-[image:var(--shell-ground)] bg-no-repeat text-shell-ink">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col lg:py-2.5 lg:pr-2.5">
          <div className={PAGE_PANEL}>
            <FirstSpaceGate />
            <RouteChangeIndicator />
            <TopBar />
            <BillingBanner />
            <div className="flex-1 overflow-auto bg-background text-foreground">
              <ErrorBoundary>
                <Suspense fallback={<PageContentSkeleton />}>
                  {page}
                </Suspense>
              </ErrorBoundary>
            </div>
          </div>
        </div>
      </div>
      <CommandPalette />
      {/* Nudge phone users toward the native app (dismissible, remembered). */}
      <MobileAppInterstitial />
      {/* Debug-only token countdown — hidden everywhere by default; opt in with
          NEXT_PUBLIC_SHOW_TOKEN_MONITOR=true (dev or prod). */}
      {process.env.NEXT_PUBLIC_SHOW_TOKEN_MONITOR === 'true' && <TokenDebugPanel />}
    </TourProvider>
    </ChatProvider>
    </BreadcrumbProvider>
    </CommandPaletteProvider>
    </ActivityPanelProvider>
    </SocketProvider>
  );
}
