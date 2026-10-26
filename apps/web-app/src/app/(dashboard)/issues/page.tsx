"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Loader2, CircleCheck, Inbox } from "lucide-react"

import { shiftIssuesApi } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { useSocketContext } from "@/contexts/socket-context"
import { cn } from "@/lib/utils"
import { Chip as Pill, PageHeader, ROW } from "@/components/page/page-kit"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { keys } from "@/lib/query-keys"
import { SEV_DOT, fmt, Chip } from "./_components/issue-display"
import { IssueThread } from "./_components/issue-thread"

export default function IssuesPage() {
  const { user } = useAuth()
  const canManage = !!(user?.canManageUsers || user?.canViewAllTasks)
  const qc = useQueryClient()
  const { subscribe, isConnected } = useSocketContext()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const listQ = useQuery({ queryKey: keys.shiftIssues.list(), queryFn: () => shiftIssuesApi.list({ status: "all" }) })
  const issues = listQ.data ?? []
  const detailQ = useQuery({
    queryKey: keys.shiftIssues.detail(selectedId),
    queryFn: () => shiftIssuesApi.get(selectedId!),
    enabled: !!selectedId,
  })
  const issue = detailQ.data
  const openCount = issues.filter((i) => ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"].includes(i.status)).length

  useEffect(() => {
    if (!isConnected) return
    const refetch = () => {
      qc.invalidateQueries({ queryKey: keys.shiftIssues.list() })
      if (selectedId) qc.invalidateQueries({ queryKey: keys.shiftIssues.detail(selectedId) })
    }
    const offs = [subscribe("shift_issue.event", refetch), subscribe("shift_issue.created", refetch)]
    return () => offs.forEach((o) => o())
  }, [subscribe, isConnected, qc, selectedId])

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title="Shift Issues"
        subtitle="Blockers reported during shifts — acknowledge, dispatch, and resolve."
        actions={
          openCount > 0 && (
            <Pill tone="crit" dot className="h-8 px-3 text-sm">
              {openCount} open
            </Pill>
          )
        }
      />

      <div className="grid h-[72vh] grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        {/* Inbox */}
        <aside
          className={cn(
            "flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-border bg-card shadow-shell",
            selectedId && "hidden md:flex",
          )}
        >
          <header className="flex items-center gap-2 px-5 pb-1 pt-4">
            <Inbox className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-[15px] font-semibold text-foreground">Inbox</h2>
            {listQ.isFetching && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </header>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2.5">
            {listQ.isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : issues.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <CircleCheck className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No issues reported. All clear.</p>
              </div>
            ) : (
              issues.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setSelectedId(i.id)}
                  aria-current={selectedId === i.id ? "true" : undefined}
                  className={ROW}
                >
                  <span
                    className={cn("mt-[5px] size-[9px] shrink-0 rounded-full", SEV_DOT[i.severity])}
                    title={i.severity}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{i.title}</span>
                      <Chip status={i.status} />
                    </div>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {i.reporterName || "Member"} · {fmt(i.createdAt)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Thread */}
        <section
          className={cn(
            "flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-border bg-card shadow-shell",
            !selectedId && "hidden md:flex",
          )}
        >
          {!issue ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              {detailQ.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <AlertTriangle className="h-8 w-8 text-muted-foreground/40" />
                  <span>Select an issue to view the conversation</span>
                </>
              )}
            </div>
          ) : (
            <IssueThread
              key={issue.id}
              issue={issue}
              canManage={canManage}
              currentUserId={user?.id}
              onBack={() => setSelectedId(null)}
              onChanged={() => {
                qc.invalidateQueries({
                  queryKey: keys.shiftIssues.detail(issue.id),
                })
                qc.invalidateQueries({ queryKey: keys.shiftIssues.list() })
              }}
            />
          )}
        </section>
      </div>
    </div>
  )
}
