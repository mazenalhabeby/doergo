'use client';

import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

function Shimmer({ className }: SkeletonProps) {
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

/** On the dark hero, a light shimmer — a slate block there would be a hole. */
function HeroShimmer({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-white/15',
        'before:absolute before:inset-0 before:-translate-x-full',
        'before:animate-[shimmer_1.5s_infinite]',
        'before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent',
        className
      )}
    />
  );
}

/**
 * The sign-in page, unfilled.
 *
 * ⚠️ This drew the PREVIOUS design: a centred 900px card with a mobile tab bar
 * and a footer. The page has been a full-bleed two-panel layout for some time —
 * a dark hero across 54% of a wide screen and the form beside it — so the wait
 * showed one page and the arrival was another, rearranging the whole screen
 * every time anybody signed in.
 *
 * It is the real page's own structure now: the same `fixed inset-0` frame, the
 * same split at `lg`, the same 26px heading over a subtitle, the same tab pair,
 * the same field rhythm. Nothing here is a guess about the design — it is the
 * design, with the words taken out.
 */
export function AuthSkeleton() {
  return (
    <div className="force-light fixed inset-0 z-10 flex flex-col overflow-y-auto bg-white lg:flex-row">
      {/* ── hero: hidden below lg, exactly as the page hides it ── */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-slate-900 p-10 text-white lg:flex lg:w-[54%] xl:p-14">
        <div className="relative">
          <HeroShimmer className="h-9 w-36 rounded-lg" />
        </div>
        <div className="relative">
          {/* The headline runs to two lines on the real page. */}
          <HeroShimmer className="h-11 w-4/5 rounded-lg" />
          <HeroShimmer className="mt-3 h-11 w-3/5 rounded-lg" />
          <HeroShimmer className="mt-5 h-4 w-72" />
          <HeroShimmer className="mt-2 h-4 w-56" />
          <div className="mt-8 flex gap-3">
            <HeroShimmer className="h-[86px] w-[170px] rounded-xl" />
            <HeroShimmer className="h-[86px] w-[128px] rounded-xl" />
          </div>
        </div>
        <div className="relative">
          <HeroShimmer className="h-3 w-48" />
        </div>
      </aside>

      {/* ── form ── */}
      <main className="flex flex-1 flex-col justify-center bg-white px-6 py-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          {/* The logo shows only below lg, where the hero is gone. */}
          <div className="mb-9 mt-2 flex justify-center lg:hidden">
            <Shimmer className="h-10 w-40 rounded-lg" />
          </div>

          <Shimmer className="h-7 w-56 rounded-lg" />
          <Shimmer className="mb-6 mt-2 h-4 w-72" />

          {/* Sign in / Create account, in their tray. */}
          <div className="mb-6 flex gap-1 rounded-[10px] bg-slate-100 p-1">
            <Shimmer className="h-9 flex-1 rounded-lg bg-white" />
            <Shimmer className="h-9 flex-1 rounded-lg" />
          </div>

          {/* Two fields, then the button — the sign-in form's own shape. */}
          <div className="space-y-4">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-1.5">
                <Shimmer className="h-3.5 w-20" />
                <Shimmer className="h-11 w-full rounded-lg" />
              </div>
            ))}
            <div className="flex items-center justify-between pt-1">
              <Shimmer className="h-4 w-28" />
              <Shimmer className="h-4 w-32" />
            </div>
            <Shimmer className="h-11 w-full rounded-lg" />
          </div>
        </div>
      </main>
    </div>
  );
}
