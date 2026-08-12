import { Skeleton } from "@/components/ui/skeleton";

export default function CrmLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <Skeleton className="mb-4 h-8 w-40" />
      <Skeleton className="mb-6 h-9 w-full max-w-md" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
      </div>
      <div className="mt-6 flex gap-4">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-64 w-72 shrink-0 rounded-lg" />)}
      </div>
    </div>
  );
}
