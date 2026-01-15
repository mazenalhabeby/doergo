'use client';

import { cn } from '@/lib/utils';

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

// ============================================================================
// Sidebar Skeleton
// ============================================================================

function SidebarSkeleton() {
  return (
    <div className="hidden md:flex h-screen w-64 flex-col bg-slate-50 border-r border-slate-200">
      {/* Logo area */}
      <div className="flex items-center gap-3 p-4 border-b border-slate-200">
        <Shimmer className="w-8 h-8 rounded-lg" />
        <Shimmer className="w-24 h-5 rounded" />
      </div>

      {/* Navigation items */}
      <div className="flex-1 p-4 space-y-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <Shimmer className="w-5 h-5 rounded" />
            <Shimmer className={cn('h-4 rounded', i === 0 ? 'w-20' : i === 1 ? 'w-16' : 'w-24')} />
          </div>
        ))}

        {/* Section divider */}
        <div className="my-4">
          <Shimmer className="w-16 h-3 rounded mb-3" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2">
              <Shimmer className="w-5 h-5 rounded" />
              <Shimmer className="w-20 h-4 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* User profile area */}
      <div className="p-4 border-t border-slate-200">
        <div className="flex items-center gap-3">
          <Shimmer className="w-10 h-10 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Shimmer className="w-24 h-4 rounded" />
            <Shimmer className="w-32 h-3 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Header Skeleton
// ============================================================================

function HeaderSkeleton() {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-slate-200 px-4 bg-white">
      <Shimmer className="w-8 h-8 rounded" />
      <div className="w-px h-4 bg-slate-200" />
      <Shimmer className="w-48 h-5 rounded" />
      <div className="flex-1" />
      <Shimmer className="w-8 h-8 rounded-full" />
    </header>
  );
}

// ============================================================================
// Stats Cards Skeleton
// ============================================================================

function StatsCardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex items-center gap-4">
        <Shimmer className="w-12 h-12 rounded-lg" />
        <div className="space-y-2">
          <Shimmer className="w-20 h-4 rounded" />
          <Shimmer className="w-12 h-7 rounded" />
        </div>
      </div>
    </div>
  );
}

function StatsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {[...Array(4)].map((_, i) => (
        <StatsCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ============================================================================
// Content Area Skeleton
// ============================================================================

function WelcomeSkeleton() {
  return (
    <div className="mb-6">
      <Shimmer className="w-64 h-8 rounded mb-2" />
      <Shimmer className="w-80 h-5 rounded" />
    </div>
  );
}

function ContentCardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Shimmer className="w-5 h-5 rounded" />
        <Shimmer className="w-32 h-6 rounded" />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="flex justify-between">
                <Shimmer className="w-24 h-4 rounded" />
                <Shimmer className="w-16 h-4 rounded" />
              </div>
              <Shimmer className="w-full h-20 rounded-lg" />
              <Shimmer className="w-32 h-3 rounded" />
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-4">
          <Shimmer className="w-32 h-9 rounded-lg" />
          <Shimmer className="w-28 h-9 rounded-lg" />
          <Shimmer className="w-24 h-9 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Dashboard Skeleton
// ============================================================================

export function DashboardSkeleton() {
  return (
    <div className="flex h-screen bg-slate-100 animate-in fade-in duration-300">
      {/* Sidebar */}
      <SidebarSkeleton />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <HeaderSkeleton />

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">
          <WelcomeSkeleton />
          <StatsGridSkeleton />
          <ContentCardSkeleton />
        </main>
      </div>
    </div>
  );
}

// ============================================================================
// Page Content Skeleton (for use inside dashboard layout)
// ============================================================================

export function PageContentSkeleton() {
  return (
    <div className="p-6 animate-in fade-in duration-300">
      <WelcomeSkeleton />
      <StatsGridSkeleton />
      <ContentCardSkeleton />
    </div>
  );
}
