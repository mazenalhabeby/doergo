"use client"

/** The shimmer the member list shows while its first page loads. */
export function MembersListSkeleton() {
  return (
            <div className="animate-in fade-in duration-300">
              {/* Shimmer table header */}
              <div className="flex items-center gap-4 px-5 py-3 bg-muted/30 border-b border-border/40">
                <div className="w-7" />
                <div className="w-10" />
                {["w-32", "w-20", "w-16", "w-20", "w-28", "w-6"].map((w, i) => (
                  <div
                    key={i}
                    className={`relative overflow-hidden rounded bg-muted h-3 ${w} before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent`}
                  />
                ))}
              </div>
              {/* Shimmer rows */}
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-border/20 last:border-0">
                  <div className="w-7" />
                  <div
                    className={"relative overflow-hidden rounded-full bg-muted size-9 before:absolute " +
                      "before:inset-0 before:-translate-x-full " +
                      "before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r " +
                      "before:from-transparent before:via-foreground/5 before:to-transparent"}
                  />
                  <div className="flex-1 space-y-1.5">
                    <div
                      className={"relative overflow-hidden rounded bg-muted h-4 before:absolute " +
                        "before:inset-0 before:-translate-x-full " +
                        "before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r " +
                        "before:from-transparent before:via-foreground/5 before:to-transparent"}
                      style={{ width: `${100 + (i * 23) % 80}px` }}
                    />
                    <div
                      className={"relative overflow-hidden rounded bg-muted h-3 w-40 before:absolute " +
                        "before:inset-0 before:-translate-x-full " +
                        "before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r " +
                        "before:from-transparent before:via-foreground/5 before:to-transparent"}
                    />
                  </div>
                  <div
                    className={"relative overflow-hidden rounded-full bg-muted h-5 w-16 before:absolute " +
                      "before:inset-0 before:-translate-x-full " +
                      "before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r " +
                      "before:from-transparent before:via-foreground/5 before:to-transparent"}
                  />
                  <div
                    className={"relative overflow-hidden rounded bg-muted h-4 w-20 before:absolute " +
                      "before:inset-0 before:-translate-x-full " +
                      "before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r " +
                      "before:from-transparent before:via-foreground/5 before:to-transparent"}
                  />
                  <div
                    className={"relative overflow-hidden rounded bg-muted h-4 w-28 before:absolute " +
                      "before:inset-0 before:-translate-x-full " +
                      "before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r " +
                      "before:from-transparent before:via-foreground/5 before:to-transparent"}
                  />
                </div>
              ))}
            </div>
  )
}
