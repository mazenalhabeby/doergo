'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * The CRM's two waits, drawn once.
 *
 * A page has three separate moments where it can be waiting — the auth check on
 * a reload, the route's own Suspense boundary, and the data query once the page
 * is mounted — and a reader should not be able to tell them apart. Drawing them
 * in one place is what makes that true; the alternative is what was here, where
 * a reload showed a generic dashboard shape and then the CRM's own skeleton and
 * then the page, rearranging twice before anything was readable.
 */

/** The clients list: heading, toolbar, then the rows that are coming. */
export function ClientsListSkeleton() {
  return (
    <div className="mx-auto max-w-[1000px] px-6 py-6">
      <Skeleton className="h-7 w-24" />
      <Skeleton className="mt-2 h-4 w-56" />

      <div className="mt-6 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3.5 w-72" />
        </div>
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <Skeleton className="h-9 w-full max-w-xs rounded-md" />
        <Skeleton className="h-8 w-56 rounded-lg" />
      </div>

      <div className="mt-4">
        <ClientRowsSkeleton />
      </div>
    </div>
  );
}

/**
 * Just the rows — used inside the list once its chrome is already painted.
 *
 * Widths vary because real names do; identical bars read as a barcode, which is
 * how a skeleton announces itself as a fake.
 */
export function ClientRowsSkeleton({ rows = 4 }: { rows?: number }) {
  const widths = [
    ['w-40', 'w-56'],
    ['w-32', 'w-44'],
    ['w-48', 'w-36'],
    ['w-36', 'w-52'],
    ['w-44', 'w-40'],
    ['w-28', 'w-48'],
  ];
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => {
        const [name, meta] = widths[i % widths.length];
        return (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-border p-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className={cn('h-3.5', name)} />
              <Skeleton className={cn('h-3', meta)} />
            </div>
            <Skeleton className="h-5 w-14 shrink-0 rounded-md" />
          </div>
        );
      })}
    </div>
  );
}

/**
 * One client's record: header card, then the 300px rail beside the main column.
 *
 * This is the record's own grid, unfilled — not an approximation of it. A
 * skeleton that does not match rearranges the page the moment the data lands,
 * which is the one thing it exists to prevent.
 */
export function ClientRecordSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <Skeleton className="mb-4 h-4 w-16" />

      <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-14 w-14 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-52" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-8 w-28 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <Skeleton className="mb-3 h-3 w-16" />
            <div className="space-y-3">
              {['w-32', 'w-24', 'w-28', 'w-20'].map((w, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className={cn('h-3.5', w)} />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <Skeleton className="mb-3 h-3 w-20" />
            <Skeleton className="h-8 w-full rounded-lg" />
          </div>
          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <Skeleton className="mb-3 h-3 w-20" />
            <Skeleton className="h-28 w-full rounded-lg" />
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
          <div className="flex items-center gap-4 border-b border-border/70 pb-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-20" />
          </div>
          <ActivityFeedSkeleton />
        </div>
      </div>
    </div>
  );
}

/** The timeline's own wait, inside a record that has already arrived. */
export function ActivityFeedSkeleton() {
  return (
    <div className="space-y-2">
      {['w-3/4', 'w-1/2', 'w-2/3'].map((w, i) => (
        <div key={i} className="flex gap-3 rounded-2xl border border-border/70 bg-card p-4">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className={cn('h-3', w)} />
          </div>
        </div>
      ))}
    </div>
  );
}
