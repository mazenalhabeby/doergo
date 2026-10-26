import { cn } from "@/lib/utils"

/** A placeholder bone — the same one every page skeleton draws (`.skeleton-bone` in globals.css). */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton-bone rounded-md", className)} {...props} />
}

export { Skeleton }
