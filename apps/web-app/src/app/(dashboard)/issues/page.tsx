"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Loader2, Send, Check, UserPlus, CircleCheck, MessageSquare, Cog } from "lucide-react"

import { shiftIssuesApi, employeesApi, type ShiftIssue, type ShiftIssueEvent } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { useSocketContext } from "@/contexts/socket-context"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

const SEV: Record<string, string> = {
  LOW: "text-slate-600 bg-slate-100 border-slate-200",
  MEDIUM: "text-blue-600 bg-blue-100 border-blue-200",
  HIGH: "text-orange-600 bg-orange-100 border-orange-200",
  URGENT: "text-red-600 bg-red-100 border-red-200",
}
const STATUS: Record<string, string> = {
  OPEN: "text-red-600 bg-red-50 border-red-200",
  ACKNOWLEDGED: "text-amber-600 bg-amber-50 border-amber-200",
  IN_PROGRESS: "text-blue-600 bg-blue-50 border-blue-200",
  RESOLVED: "text-green-600 bg-green-50 border-green-200",
  CLOSED: "text-slate-500 bg-slate-50 border-slate-200",
  CANCELED: "text-slate-400 bg-slate-50 border-slate-200",
}
const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
const isImg = (m?: string) => !!m && m.startsWith("image/")

export default function IssuesPage() {
  const { user } = useAuth()
  const canManage = !!((user as any)?.canManageUsers || (user as any)?.canViewAllTasks)
  const qc = useQueryClient()
  const { subscribe, isConnected } = useSocketContext()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const listQ = useQuery({ queryKey: ["shift-issues"], queryFn: () => shiftIssuesApi.list({ status: "all" }) })
  const issues = listQ.data ?? []
  const detailQ = useQuery({ queryKey: ["shift-issue", selectedId], queryFn: () => shiftIssuesApi.get(selectedId!), enabled: !!selectedId })
  const issue = detailQ.data

  // Live: refetch the inbox + open thread on any issue socket event.
  useEffect(() => {
    if (!isConnected) return
    const refetch = () => {
      qc.invalidateQueries({ queryKey: ["shift-issues"] })
      if (selectedId) qc.invalidateQueries({ queryKey: ["shift-issue", selectedId] })
    }
    const offs = [subscribe("shift_issue.event", refetch), subscribe("shift_issue.created", refetch)]
    return () => offs.forEach((o) => o())
  }, [subscribe, isConnected, qc, selectedId])

  useEffect(() => { if (!selectedId && issues.length) setSelectedId(issues[0].id) }, [issues, selectedId])

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-6xl gap-4 p-4">
      {/* Inbox */}
      <aside className="flex w-80 shrink-0 flex-col rounded-2xl border border-border/60 bg-card">
        <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-semibold">Shift Issues</h1>
          {listQ.isFetching && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {issues.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No issues reported.</p>
          ) : issues.map((i) => (
            <button key={i.id} onClick={() => setSelectedId(i.id)}
              className={cn("flex w-full flex-col gap-1 border-b border-border/40 px-4 py-3 text-left transition-colors hover:bg-accent/40", selectedId === i.id && "bg-accent/60")}>
              <div className="flex items-center gap-2">
                <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px] font-medium", SEV[i.severity])}>{i.severity}</span>
                <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px] font-medium", STATUS[i.status])}>{i.status.replace("_", " ")}</span>
              </div>
              <span className="truncate text-sm font-medium text-foreground">{i.title}</span>
              <span className="text-xs text-muted-foreground">{i.reporterName || "Member"} · {fmt(i.createdAt)}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Thread */}
      <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-border/60 bg-card">
        {!issue ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {detailQ.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Select an issue"}
          </div>
        ) : (
          <IssueThread key={issue.id} issue={issue} canManage={canManage} currentUserId={(user as any)?.id} onChanged={() => { qc.invalidateQueries({ queryKey: ["shift-issue", issue.id] }); qc.invalidateQueries({ queryKey: ["shift-issues"] }) }} />
        )}
      </section>
    </div>
  )
}

function IssueThread({ issue, canManage, currentUserId, onChanged }: { issue: ShiftIssue; canManage: boolean; currentUserId?: string; onChanged: () => void }) {
  const [draft, setDraft] = useState("")
  const [assignOpen, setAssignOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const thread = issue.thread ?? []

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }) }, [thread.length])

  const membersQ = useQuery({ queryKey: ["issue-assignables"], queryFn: () => employeesApi.list({ limit: 100 } as any), enabled: assignOpen })
  const members: any[] = (membersQ.data as any)?.data ?? (membersQ.data as any)?.employees ?? []

  const send = useMutation({
    mutationFn: () => shiftIssuesApi.message(issue.id, { body: draft.trim() }),
    onSuccess: () => { setDraft(""); onChanged() },
    onError: (e: any) => notify.error(e?.message || "Failed to send"),
  })
  const act = (fn: () => Promise<any>) => fn().then(onChanged).catch((e: any) => notify.error(e?.message || "Action failed"))

  const closed = issue.status === "RESOLVED" || issue.status === "CLOSED" || issue.status === "CANCELED"

  return (
    <>
      <header className="border-b border-border/60 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", SEV[issue.severity])}>{issue.severity}</span>
              <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", STATUS[issue.status])}>{issue.status.replace("_", " ")}</span>
            </div>
            <h2 className="text-lg font-semibold text-foreground">{issue.title}</h2>
            <p className="text-xs text-muted-foreground">
              Reported by {issue.reporterName || "member"}
              {issue.assigneeName ? ` · dispatched to ${issue.assigneeName}` : ""}
            </p>
          </div>
          {canManage && !closed && (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {issue.status === "OPEN" && (
                <Button size="sm" variant="outline" onClick={() => act(() => shiftIssuesApi.acknowledge(issue.id))}>
                  <Check className="mr-1.5 h-3.5 w-3.5" /> Acknowledge
                </Button>
              )}
              <div className="relative">
                <Button size="sm" variant="outline" onClick={() => setAssignOpen((v) => !v)}>
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" /> {issue.assigneeName ? "Reassign" : "Dispatch"}
                </Button>
                {assignOpen && (
                  <div className="absolute right-0 z-10 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
                    {membersQ.isLoading ? (
                      <div className="p-2 text-center text-xs text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>
                    ) : members.length === 0 ? (
                      <p className="p-2 text-xs text-muted-foreground">No members</p>
                    ) : members.map((m) => (
                      <button key={m.id} onClick={() => { setAssignOpen(false); act(() => shiftIssuesApi.assign(issue.id, m.id)) }}
                        className="block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-accent">
                        {m.firstName} {m.lastName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button size="sm" onClick={() => act(() => shiftIssuesApi.setStatus(issue.id, "RESOLVED"))}>
                <CircleCheck className="mr-1.5 h-3.5 w-3.5" /> Resolve
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Unified thread */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {thread.map((e) => <ThreadItem key={e.id} e={e} mine={e.actorId === currentUserId} />)}
      </div>

      {/* Composer */}
      {!closed ? (
        <div className="flex items-end gap-2 border-t border-border/60 p-3">
          <Textarea value={draft} onChange={(ev) => setDraft(ev.target.value)} rows={1}
            placeholder="Message on this issue…" className="max-h-32 min-h-[40px] resize-none"
            onKeyDown={(ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); if (draft.trim()) send.mutate() } }} />
          <Button size="icon" disabled={!draft.trim() || send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      ) : (
        <div className="border-t border-border/60 p-3 text-center text-xs text-muted-foreground">
          This issue is {issue.status.toLowerCase()}.
          {canManage && (
            <Button variant="link" size="sm" className="ml-1 h-auto p-0 text-xs" onClick={() => shiftIssuesApi.setStatus(issue.id, "IN_PROGRESS").then(onChanged)}>Reopen</Button>
          )}
        </div>
      )}
    </>
  )
}

function ThreadItem({ e, mine }: { e: ShiftIssueEvent; mine: boolean }) {
  if (e.type === "MESSAGE") {
    return (
      <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
        <div className={cn("max-w-[75%] rounded-2xl px-3 py-2", mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
          {!mine && <p className="mb-0.5 text-[11px] font-semibold opacity-70">{e.actorName}</p>}
          {e.body && <p className="whitespace-pre-wrap break-words text-sm">{e.body}</p>}
          {!!e.attachments?.length && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {e.attachments.map((a) => isImg(a.mimeType) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <a key={a.id} href={a.url ?? a.fileUrl} target="_blank" rel="noreferrer"><img src={a.url ?? a.fileUrl} alt={a.fileName} className="h-20 w-20 rounded-lg object-cover" /></a>
              ) : (
                <a key={a.id} href={a.url ?? a.fileUrl} target="_blank" rel="noreferrer" className="text-xs underline">{a.fileName}</a>
              ))}
            </div>
          )}
        </div>
        <span className="mt-0.5 text-[10px] text-muted-foreground">{fmt(e.at)}</span>
      </div>
    )
  }
  // System event
  const label =
    e.type === "CREATED" ? `${e.actorName} reported this issue` :
    e.type === "ACKNOWLEDGED" ? `${e.actorName} acknowledged` :
    e.type === "ASSIGNED" ? `Dispatched to ${e.metadata?.assignedToName ?? "someone"}` :
    e.type === "RESOLVED" ? `${e.actorName} marked it resolved` :
    e.type === "REOPENED" ? `${e.actorName} reopened it` :
    e.type === "CLOSED" ? `${e.actorName} closed it` :
    `${e.actorName} updated the issue`
  return (
    <div className="flex items-center justify-center gap-1.5 py-1 text-[11px] text-muted-foreground">
      {e.type === "CREATED" ? <MessageSquare className="h-3 w-3" /> : <Cog className="h-3 w-3" />}
      <span>{label}</span><span className="opacity-60">· {fmt(e.at)}</span>
    </div>
  )
}
