'use client';

import { cn } from '@/lib/utils';
import { PAGE_WIDTH } from "@/components/ui/page-width";

// Leaf skeleton pieces with no dependencies of their own. They live apart from
// dashboard-skeleton.tsx so RouteSkeleton can use the generic content shape
// without the two files importing each other in a cycle.

/**
 * The one shimmering placeholder.
 *
 * Every skeleton in the app draws from this: the page skeletons, the dashboard,
 * and the task views. Four separate copies of the same 200-character class
 * string existed before — one per skeleton file plus ~20 pasted inline into the
 * tasks page — so a change to the sheen meant finding all of them.
 *
 * `delayMs` offsets the sweep per element, via a custom property because the
 * animation runs on the ::before pseudo-element, which inline styles can't reach.
 */
export function Shimmer({
  className,
  style,
  delayMs = 0,
}: {
  className?: string
  style?: React.CSSProperties
  delayMs?: number
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-muted',
        'before:absolute before:inset-0 before:-translate-x-full',
        'before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent',
        'before:animate-[shimmer_1.5s_infinite] before:[animation-delay:var(--shimmer-delay,0ms)]',
        'motion-reduce:before:animate-none',
        className,
      )}
      style={{ ...style, '--shimmer-delay': `${delayMs}ms` } as React.CSSProperties}
    />
  );
}

// ============================================================================
// Navbar Skeleton — matches the real TopNavbar layout
// ============================================================================

export function NavbarSkeleton() {
  return (
    <header className="sticky top-0 z-50 h-14 shrink-0 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className={cn(PAGE_WIDTH, "flex h-full items-center")}>
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
/**
 * The shape of a page we cannot predict.
 *
 * ⚠️ It used to draw a six-column grid of cards with avatar circles — a
 * DASHBOARD. Every route that is not the dashboard or tasks falls back to this,
 * so reloading the clients list, the assets register or a portal showed the
 * dashboard for a moment and then rearranged into something else entirely.
 *
 * It cannot be more specific than this, and should not try: CRM, assets and
 * portals are module-gated, so at the moment this renders — the auth check, when
 * the user is still unknown — the route may not exist for this organization at
 * all. Promising one of their layouts would be drawing a page that never comes.
 *
 * So it draws what nearly every content page in this product shares and nothing
 * more: a title, a toolbar, and a list. Neutral enough to be honest about a page
 * it has not identified, and close enough that the arrival is not a jolt.
 */
export function GenericContentSkeleton() {
  return (
    <div className="mx-auto max-w-[1100px] px-6 py-6">
      <Shimmer className="h-7 w-40 rounded" />
      <Shimmer className="mt-2 h-4 w-64 rounded" />

      <div className="mt-6 flex items-center justify-between gap-3">
        <Shimmer className="h-9 w-72 max-w-full rounded-md" />
        <Shimmer className="h-9 w-32 rounded-lg" />
      </div>

      {/* Widths vary because real content does; identical bars read as a barcode. */}
      <div className="mt-4 space-y-2">
        {[
          ['w-40', 'w-56'],
          ['w-32', 'w-44'],
          ['w-48', 'w-36'],
          ['w-36', 'w-52'],
          ['w-44', 'w-40'],
        ].map(([a, b], i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-border p-3">
            <Shimmer className="h-10 w-10 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Shimmer className={`h-3.5 rounded ${a}`} />
              <Shimmer className={`h-3 rounded ${b}`} />
            </div>
            <Shimmer className="h-5 w-14 shrink-0 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
