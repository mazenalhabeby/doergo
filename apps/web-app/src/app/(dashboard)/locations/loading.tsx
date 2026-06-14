import { cn } from "@/lib/utils"

function S({ className }: { className?: string }) {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-md bg-muted",
      "before:absolute before:inset-0 before:-translate-x-full",
      "before:animate-[shimmer_1.5s_infinite]",
      "before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent",
      className,
    )} />
  )
}

export default function LocationsLoading() {
  return (
    <div className="min-h-full bg-background animate-in fade-in duration-200">
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <S className="h-8 w-40 rounded-lg" />
            <S className="mt-2 h-4 w-64" />
          </div>
          <S className="h-9 w-32 rounded-lg" />
        </div>

        {/* Search + filter */}
        <div className="flex gap-3">
          <S className="h-9 flex-1 max-w-sm rounded-lg" />
          <S className="h-9 w-28 rounded-lg" />
        </div>

        {/* Space cards */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <S className="size-10 rounded-lg" />
                <div className="space-y-1.5">
                  <S className={cn("h-4", i === 0 ? "w-24" : i === 1 ? "w-32" : "w-40")} />
                  <S className="h-3 w-48" />
                </div>
              </div>
              <S className="h-6 w-16 rounded-full" />
            </div>
            <div className="flex items-center gap-3 mt-3">
              {Array.from({ length: 3 + i }).map((_, j) => (
                <S key={j} className={cn("h-5 rounded-full", j === 0 ? "w-12" : j === 1 ? "w-16" : "w-20")} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
