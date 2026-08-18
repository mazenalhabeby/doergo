'use client';

import { cn } from '@/lib/utils';

// Leaf skeleton pieces with no dependencies of their own. They live apart from
// dashboard-skeleton.tsx so RouteSkeleton can use the generic content shape
// without the two files importing each other in a cycle.

function Shimmer({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-muted',
        'before:absolute before:inset-0 before:-translate-x-full',
        'before:animate-[shimmer_1.5s_infinite]',
        'before:bg-gradient-to-r before:from-transparent before:via-card/60 before:to-transparent',
        className
      )}
      style={style}
    />
  );
}

// ============================================================================
// Navbar Skeleton — matches the real TopNavbar layout
// ============================================================================

export function NavbarSkeleton() {
  return (
    <header className="sticky top-0 z-50 h-14 shrink-0 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-[1440px] items-center px-6">
        {/* Logo */}
        <div className="mr-6 flex items-center gap-2">
          <Shimmer className="w-6 h-6 rounded" />
          <Shimmer className="w-20 h-5 rounded" />
        </div>

        {/* Nav items */}
        <div className="hidden lg:flex items-center gap-1">
          {[56, 40, 44, 48, 56, 64].map((w, i) => (
            <Shimmer key={i} className="h-7 rounded-md" style={{ width: w }} />
          ))}
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          <Shimmer className="w-24 h-8 rounded-lg" />
          <Shimmer className="w-8 h-8 rounded-full" />
          <Shimmer className="w-8 h-8 rounded-full" />
        </div>
      </div>
    </header>
  );
}

// ============================================================================
// Content Skeleton — generic page content placeholder
// ============================================================================

/** Fallback shape for routes without a page-specific skeleton. See RouteSkeleton. */
export function GenericContentSkeleton() {
  return (
    <div className="max-w-[1440px] mx-auto px-6 py-6">
      {/* Header area */}
      <div className="mb-6">
        <Shimmer className="w-48 h-4 rounded mb-2" />
        <Shimmer className="w-72 h-8 rounded" />
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-6 gap-3">
        {[2, 2, 2, 3, 3].map((span, i) => (
          <div
            key={i}
            className="bg-card rounded-xl border border-border p-4"
            style={{ gridColumn: `span ${span}` }}
          >
            <Shimmer className="w-20 h-3 rounded mb-3" />
            <div className="flex items-center gap-2">
              {[...Array(Math.min(span, 3))].map((_, j) => (
                <Shimmer key={j} className="w-10 h-10 rounded-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
