import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { PAGE_WIDTH } from "@/components/ui/page-width"

/** The sheet's silhouette: letterhead, title, pills, the facts grid, two sections. */
export function ReportSheetSkeleton() {
  return (
    <div className="mx-auto w-full rounded-sm bg-white px-6 py-8 shadow-sm ring-1 ring-slate-200 sm:px-10 sm:py-10">
      <div className="flex justify-between gap-6 border-b-[3px] border-slate-200 pb-5">
        <div className="space-y-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-3 w-56" /><Skeleton className="h-3 w-44" /></div>
        <div className="flex flex-col items-end gap-2"><Skeleton className="h-6 w-32" /><Skeleton className="h-3 w-20" /></div>
      </div>
      <Skeleton className="mt-6 h-7 w-2/3" />
      <div className="mt-3 flex gap-2"><Skeleton className="h-6 w-24 rounded-full" /><Skeleton className="h-6 w-16 rounded-full" /></div>
      <div className="mt-6 grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-4 md:grid-cols-4">
        {Array.from({
          length: 8
        }).map((_, i) => <div key={i} className="space-y-1.5"><Skeleton className="h-2.5 w-14" /><Skeleton className="h-4 w-24" /></div>)}
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="pt-7">
          <Skeleton className="h-5 w-40" />
          <div
            className="mt-3 space-y-2"><Skeleton
              className="h-3 w-full"
            /><Skeleton className="h-3 w-5/6" /><Skeleton className="h-3 w-2/3" /></div>
        </div>
      ))}
    </div>
  )
}

/** The whole page while it loads: the bar, the rail, the sheet. */
export function JobReportPageSkeleton() {
  return (
    <div>
      <div className="border-b border-border">
        <div className={cn(PAGE_WIDTH, "flex items-center gap-3.5 py-2.5")}>
          <Skeleton className="size-[30px]" />
          <div className="space-y-1"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-20" /></div>
          <span className="flex-1" />
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-8 w-32" />
        </div>
      </div>
      <div className={cn(PAGE_WIDTH, "grid items-start lg:grid-cols-[320px_minmax(0,1fr)]")}>
        <div className="space-y-2 px-4 py-5">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-4 w-40" />)}</div>
        <div className="px-4 py-6 sm:px-6 lg:px-8"><div className="mx-auto max-w-[820px]"><ReportSheetSkeleton /></div></div>
      </div>
    </div>
  )
}
