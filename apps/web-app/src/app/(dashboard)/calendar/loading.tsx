export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6">
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="hidden space-y-4 lg:block">
          <div className="h-10 animate-pulse rounded-xl bg-muted/60" />
          <div className="h-56 animate-pulse rounded-xl bg-muted/40" />
          <div className="h-48 animate-pulse rounded-xl bg-muted/40" />
        </div>
        <div className="space-y-4">
          <div className="h-8 w-64 animate-pulse rounded-lg bg-muted/60" />
          <div className="h-[640px] animate-pulse rounded-2xl border bg-muted/30" />
        </div>
      </div>
    </div>
  )
}
