import { cn } from "@/lib/utils";
import { PAGE_SHELL } from "@/components/ui/page-width";

export default function Loading() {
  return (
    <div className={cn(PAGE_SHELL, "animate-pulse")}>
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
