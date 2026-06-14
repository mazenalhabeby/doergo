export default function Loading() {
  return (
    <div className="max-w-[1440px] mx-auto px-6 py-6 animate-pulse">
      <div className="flex items-center gap-4 mb-6">
        <div className="size-14 rounded-full bg-muted" />
        <div className="space-y-2">
          <div className="h-6 w-40 bg-muted rounded" />
          <div className="h-4 w-24 bg-muted/60 rounded" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-24 bg-card rounded-xl border border-border" />
        ))}
      </div>
    </div>
  )
}
