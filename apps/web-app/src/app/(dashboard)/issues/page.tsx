"use client"

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, CircleCheck, Inbox } from "lucide-react";

import { shiftIssuesApi } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context"
import { useSocketContext } from "@/contexts/socket-context"
import { cn } from "@/lib/utils"
import { keys } from "@/lib/query-keys"
import { SEV_DOT, fmt, Chip } from "./_components/issues-helpers";
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
    enabled: !!selectedId
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
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      {/* Page header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Shift Issues</h1>
          <p className="text-sm text-muted-foreground">Blockers reported during shifts — acknowledge, dispatch, and resolve.</p>
        </div>
        {openCount > 0 && (
          <span
            className={"ml-auto rounded-full bg-red-100 px-3 py-1 text-sm font-semibold " +
              "text-red-700 dark:bg-red-950/50 dark:text-red-300"}>{openCount} open</span>
        )}
      </div>

      <div className="grid h-[72vh] grid-cols-1 gap-4 md:grid-cols-[20rem_1fr]">
        {/* Inbox */}
        <aside
          className={cn(
            ("flex min-h-0 flex-col overflow-hidden rounded-2xl border " + "border-border/60 bg-card shadow-sm"),
            selectedId && "hidden md:flex")}>
          <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <Inbox className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Inbox</h2>
            {listQ.isFetching && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {listQ.isLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : issues.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <CircleCheck className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No issues reported. All clear.</p>
              </div>
            ) : issues.map((i) => (
              <button key={i.id} onClick={() => setSelectedId(i.id)}
                className={cn(
                  ("flex w-full gap-3 border-b border-border/40 px-4 py-3 text-left " + "transition-colors hover:bg-accent/50"),
                  selectedId === i.id && "bg-accent/70")}>
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", SEV_DOT[i.severity])} title={i.severity} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{i.title}</span>
                    <Chip status={i.status} />
                  </div>
                  <span
                    className="mt-0.5 block truncate text-xs text-muted-foreground">{i.reporterName || "Member"} · {fmt(i.createdAt)}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Thread */}
        <section
          className={cn(
            ("flex min-h-0 flex-col overflow-hidden rounded-2xl border " + "border-border/60 bg-card shadow-sm"),
            !selectedId && "hidden md:flex")}>
          {!issue ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              {detailQ.isLoading
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : (<><AlertTriangle
                  className="h-8 w-8 text-muted-foreground/40"
                /><span>Select an issue to view the conversation</span></>)}
            </div>
          ) : (
            <IssueThread key={issue.id} issue={issue} canManage={canManage} currentUserId={user?.id}
              onBack={() => setSelectedId(null)}
              onChanged={() => { qc.invalidateQueries({
                queryKey: keys.shiftIssues.detail(issue.id)
              }); qc.invalidateQueries({ queryKey: keys.shiftIssues.list() }) }} />
          )}
        </section>
      </div>
    </div>
  )
}
