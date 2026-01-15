'use client';

import { cn } from '../../lib/utils';

interface ShimmerProps {
  className?: string;
}

function Shimmer({ className }: ShimmerProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-slate-200',
        'before:absolute before:inset-0 before:-translate-x-full',
        'before:animate-[shimmer_1.5s_infinite]',
        'before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent',
        className
      )}
    />
  );
}

function LogoSkeleton() {
  return (
    <div className="flex items-center justify-center gap-3 mb-6">
      <Shimmer className="w-10 h-10 rounded-xl" />
      <Shimmer className="w-24 h-6 rounded-md" />
    </div>
  );
}

function FormFieldSkeleton({ hasIcon = true }: { hasIcon?: boolean }) {
  return (
    <div className="space-y-2">
      <Shimmer className="w-16 h-4 rounded" />
      <div className="relative">
        {hasIcon && (
          <Shimmer className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded" />
        )}
        <Shimmer className={cn('w-full h-11 rounded-lg', hasIcon && 'pl-10')} />
      </div>
    </div>
  );
}

function ButtonSkeleton({ className }: ShimmerProps) {
  return <Shimmer className={cn('w-full h-11 rounded-lg', className)} />;
}

function DividerSkeleton() {
  return (
    <div className="relative my-5">
      <div className="absolute inset-0 flex items-center">
        <Shimmer className="w-full h-px" />
      </div>
      <div className="relative flex justify-center">
        <Shimmer className="w-28 h-4 rounded bg-white" />
      </div>
    </div>
  );
}

function SocialButtonsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Shimmer className="h-11 rounded-lg" />
      <Shimmer className="h-11 rounded-lg" />
    </div>
  );
}

function TabSwitcherSkeleton() {
  return (
    <div className="flex md:hidden bg-slate-100 p-1 rounded-xl mb-6">
      <Shimmer className="flex-1 h-10 rounded-lg" />
      <Shimmer className="flex-1 h-10 rounded-lg ml-1" />
    </div>
  );
}

// Simple form skeleton for login-only pages
function SimpleFormSkeleton() {
  return (
    <div className="space-y-4">
      <FormFieldSkeleton />
      <FormFieldSkeleton />
      <div className="flex items-center gap-2">
        <Shimmer className="w-4 h-4 rounded" />
        <Shimmer className="w-32 h-4 rounded" />
      </div>
      <ButtonSkeleton />
      <DividerSkeleton />
      <SocialButtonsSkeleton />
    </div>
  );
}

// ============================================================================
// Mobile Auth Skeleton
// ============================================================================

function MobileAuthSkeleton({ showTabs = true }: { showTabs?: boolean }) {
  return (
    <div className="md:hidden">
      <div className="bg-white rounded-2xl shadow-modal p-5 sm:p-6">
        <LogoSkeleton />
        {showTabs && <TabSwitcherSkeleton />}
        <SimpleFormSkeleton />
      </div>
    </div>
  );
}

// ============================================================================
// Desktop Auth Skeleton
// ============================================================================

function DesktopAuthSkeleton({ showOverlay = true }: { showOverlay?: boolean }) {
  return (
    <div className="hidden md:block relative bg-white rounded-2xl shadow-modal overflow-hidden min-h-[600px]">
      <div className="flex h-full min-h-[600px]">
        {showOverlay && (
          <div className="w-1/2 p-6 lg:p-8 opacity-0">
            <FormSkeleton />
          </div>
        )}
        <div className={cn('p-6 lg:p-8', showOverlay ? 'w-1/2' : 'w-full max-w-md mx-auto')}>
          <FormSkeleton />
        </div>
      </div>

      {showOverlay && (
        <div className="absolute top-0 left-0 w-1/2 h-full">
          <OverlayPanelSkeleton />
        </div>
      )}
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col justify-center h-full">
      <div className="space-y-2 mb-6">
        <Shimmer className="w-40 h-7 rounded-md" />
        <Shimmer className="w-56 h-4 rounded" />
      </div>
      <SimpleFormSkeleton />
    </div>
  );
}

function OverlayPanelSkeleton() {
  return (
    <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-8">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-accent-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '0.5s' }} />
      </div>

      <div className="relative z-10 text-center max-w-xs space-y-6">
        <div className="flex items-center justify-center">
          <div className="w-12 h-12 rounded-xl bg-white/10 animate-pulse" />
        </div>
        <div className="space-y-2">
          <div className="h-8 w-48 mx-auto rounded-md bg-white/10 animate-pulse" />
          <div className="h-4 w-64 mx-auto rounded bg-white/5 animate-pulse" />
        </div>
        <div className="w-56 h-40 mx-auto rounded-xl bg-white/5 animate-pulse" />
        <div className="h-12 w-full rounded-xl bg-white/10 animate-pulse" />
      </div>
    </div>
  );
}

// ============================================================================
// Footer Skeleton
// ============================================================================

function FooterSkeleton() {
  return (
    <div className="flex justify-center gap-1 mt-6 px-4">
      <Shimmer className="w-48 h-4 rounded" />
      <Shimmer className="w-12 h-4 rounded" />
      <Shimmer className="w-8 h-4 rounded" />
      <Shimmer className="w-24 h-4 rounded" />
    </div>
  );
}

// ============================================================================
// Main Exports
// ============================================================================

interface AuthSkeletonProps {
  showTabs?: boolean;
  showOverlay?: boolean;
}

export function AuthSkeleton({ showTabs = true, showOverlay = true }: AuthSkeletonProps) {
  return (
    <div className="w-full max-w-[900px] mx-auto animate-in fade-in duration-300">
      <MobileAuthSkeleton showTabs={showTabs} />
      <DesktopAuthSkeleton showOverlay={showOverlay} />
      <FooterSkeleton />
    </div>
  );
}

// Simple auth skeleton (no sliding panel, just login form)
export function SimpleAuthSkeleton() {
  return (
    <div className="w-full max-w-md mx-auto animate-in fade-in duration-300">
      <div className="bg-white rounded-2xl shadow-modal p-6 sm:p-8">
        <LogoSkeleton />
        <SimpleFormSkeleton />
      </div>
      <FooterSkeleton />
    </div>
  );
}
