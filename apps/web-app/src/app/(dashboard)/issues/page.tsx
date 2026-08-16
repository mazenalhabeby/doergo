"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Loader2, Send, Check, UserPlus, CircleCheck, Cog, Inbox, ChevronLeft, ImagePlus, X } from "lucide-react"

import { shiftIssuesApi, employeesApi, uploadToS3, type ShiftIssue, type ShiftIssueEvent } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { useSocketContext } from "@/contexts/socket-context"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

const SEV_DOT: Record<string, string> = { LOW: "bg-slate-400", MEDIUM: "bg-blue-500", HIGH: "bg-orange-500", URGENT: "bg-red-500" }
const SEV_TEXT: Record<string, string> = { LOW: "text-slate-600", MEDIUM: "text-blue-600", HIGH: "text-orange-600", URGENT: "text-red-600" }
const STATUS: Record<string, string> = {
  OPEN: "text-red-700 bg-red-50 border-red-200 dark:bg-red-950/40 dark:text-red-300",
  ACKNOWLEDGED: "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300",
  IN_PROGRESS: "text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300",
  RESOLVED: "text-green-700 bg-green-50 border-green-200 dark:bg-green-950/40 dark:text-green-300",
  CLOSED: "text-slate-600 bg-slate-100 border-slate-200 dark:bg-slate-800 dark:text-slate-300",
  CANCELED: "text-slate-500 bg-slate-50 border-slate-200 dark:bg-slate-800 dark:text-slate-400",
}
const RESOLVE_REASONS = ["Fixed on site", "Parts not available", "Needs a specialist", "Customer unavailable", "Duplicate", "Not an issue"]
const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
const isImg = (m?: string) => !!m && m.startsWith("image/")
const Chip = ({ status }: { status: string }) => (
  <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", STATUS[status])}>{status.replace("_", " ")}</span>
)

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
  const openCount = issues.filter((i) => ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"].includes(i.status)).length

  useEffect(() => {
    if (!isConnected) return
    const refetch = () => {
      qc.invalidateQueries({ queryKey: ["shift-issues"] })
      if (selectedId) qc.invalidateQueries({ queryKey: ["shift-issue", selectedId] })
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
          <span className="ml-auto rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300">{openCount} open</span>
        )}
      </div>

      <div className="grid h-[72vh] grid-cols-1 gap-4 md:grid-cols-[20rem_1fr]">
        {/* Inbox */}
        <aside className={cn("flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm", selectedId && "hidden md:flex")}>
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
                className={cn("flex w-full gap-3 border-b border-border/40 px-4 py-3 text-left transition-colors hover:bg-accent/50", selectedId === i.id && "bg-accent/70")}>
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", SEV_DOT[i.severity])} title={i.severity} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{i.title}</span>
                    <Chip status={i.status} />
                  </div>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{i.reporterName || "Member"} · {fmt(i.createdAt)}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Thread */}
        <section className={cn("flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm", !selectedId && "hidden md:flex")}>
          {!issue ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              {detailQ.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (<><AlertTriangle className="h-8 w-8 text-muted-foreground/40" /><span>Select an issue to view the conversation</span></>)}
            </div>
          ) : (
            <IssueThread key={issue.id} issue={issue} canManage={canManage} currentUserId={(user as any)?.id}
              onBack={() => setSelectedId(null)}
              onChanged={() => { qc.invalidateQueries({ queryKey: ["shift-issue", issue.id] }); qc.invalidateQueries({ queryKey: ["shift-issues"] }) }} />
          )}
        </section>
      </div>
    </div>
  )
}

function IssueThread({ issue, canManage, currentUserId, onChanged, onBack }: { issue: ShiftIssue; canManage: boolean; currentUserId?: string; onChanged: () => void; onBack: () => void }) {
  const [draft, setDraft] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [assignOpen, setAssignOpen] = useState(false)
  const [resolveOpen, setResolveOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [viewer, setViewer] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const thread = issue.thread ?? []

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }) }, [thread.length])

  const membersQ = useQuery({ queryKey: ["issue-assignables"], queryFn: () => employeesApi.list({ limit: 100 } as any), enabled: assignOpen })
  const members: any[] = (membersQ.data as any)?.data ?? (membersQ.data as any)?.employees ?? []

  const send = useMutation({
    mutationFn: async () => {
      const attachments: any[] = []
      for (const f of files) {
        const pre = await shiftIssuesApi.presignAttachment(issue.id, f.name, f.type)
        await uploadToS3(pre.uploadUrl, f)
        attachments.push({ fileKey: pre.fileKey, fileUrl: pre.fileUrl, fileName: f.name, fileSize: f.size, mimeType: f.type })
      }
      return shiftIssuesApi.message(issue.id, { body: draft.trim(), attachments })
    },
    onSuccess: () => { setDraft(""); setFiles([]); onChanged() },
    onError: (e: any) => notify.error(e?.message || "Failed to send"),
  })
  const act = (fn: () => Promise<any>) => fn().then(onChanged).catch((e: any) => notify.error(e?.message || "Action failed"))
  const closed = ["RESOLVED", "CLOSED", "CANCELED"].includes(issue.status)

  return (
    <>
      <header className="border-b border-border/60 px-4 py-3.5 md:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <button onClick={onBack} className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground hover:bg-accent md:hidden"><ChevronLeft className="h-4 w-4" /></button>
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold uppercase", SEV_TEXT[issue.severity])}>
                  <span className={cn("h-2 w-2 rounded-full", SEV_DOT[issue.severity])} />{issue.severity}
                </span>
                <Chip status={issue.status} />
              </div>
              <h2 className="truncate text-lg font-semibold text-foreground">{issue.title}</h2>
              <p className="text-xs text-muted-foreground">
                Reported by {issue.reporterName || "member"}{issue.assigneeName ? ` · dispatched to ${issue.assigneeName}` : ""}
              </p>
            </div>
          </div>
          {canManage && !closed && (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {issue.status === "OPEN" && (
                <Button size="sm" variant="outline" onClick={() => act(() => shiftIssuesApi.acknowledge(issue.id))}><Check className="mr-1.5 h-3.5 w-3.5" /> Acknowledge</Button>
              )}
              <div className="relative">
                <Button size="sm" variant="outline" onClick={() => setAssignOpen((v) => !v)}><UserPlus className="mr-1.5 h-3.5 w-3.5" /> {issue.assigneeName ? "Reassign" : "Dispatch"}</Button>
                {assignOpen && (
                  <div className="absolute right-0 z-10 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
                    {membersQ.isLoading ? (
                      <div className="p-3 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" /></div>
                    ) : members.length === 0 ? (<p className="p-2 text-xs text-muted-foreground">No members</p>) : members.map((m) => (
                      <button key={m.id} onClick={() => { setAssignOpen(false); act(() => shiftIssuesApi.assign(issue.id, m.id)) }}
                        className="block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-accent">{m.firstName} {m.lastName}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <Button size="sm" onClick={() => setResolveOpen((v) => !v)}><CircleCheck className="mr-1.5 h-3.5 w-3.5" /> Resolve</Button>
                {resolveOpen && (
                  <div className="absolute right-0 z-10 mt-1 w-72 rounded-xl border border-border bg-popover p-3 shadow-lg">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">Reason (optional)</p>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {RESOLVE_REASONS.map((r) => (
                        <button key={r} type="button" onClick={() => setReason(r)}
                          className={cn("rounded-full border px-2.5 py-1 text-[11px] transition-colors", reason === r ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent")}>{r}</button>
                      ))}
                    </div>
                    <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Add a note / excuse…" className="mb-2 resize-none text-sm" />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => { setResolveOpen(false); setReason("") }}>Cancel</Button>
                      <Button size="sm" onClick={() => { setResolveOpen(false); const r = reason.trim(); setReason(""); act(() => shiftIssuesApi.setStatus(issue.id, "RESOLVED", r || undefined)) }}>Resolve</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 px-4 py-4 md:px-5">
        {thread.map((e) => <ThreadItem key={e.id} e={e} mine={e.actorId === currentUserId} onOpenImage={setViewer} />)}
      </div>

      {/* Full-screen image lightbox */}
      {viewer && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4" onClick={() => setViewer(null)}>
          <button type="button" onClick={() => setViewer(null)} className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"><X className="h-5 w-5" /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewer} alt="" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {!closed ? (
        <div className="border-t border-border/60 bg-card p-3">
          {files.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px]">
                  <span className="max-w-[120px] truncate">{f.name}</span>
                  <button onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden"
              onChange={(e) => { setFiles((p) => [...p, ...Array.from(e.target.files ?? [])].slice(0, 5)); e.currentTarget.value = "" }} />
            <Button size="icon" variant="ghost" className="h-[42px] w-[42px] shrink-0" disabled={files.length >= 5} onClick={() => fileRef.current?.click()}>
              <ImagePlus className="h-4 w-4" />
            </Button>
            <Textarea value={draft} onChange={(ev) => setDraft(ev.target.value)} rows={1}
              placeholder="Message on this issue…" className="max-h-32 min-h-[42px] resize-none rounded-xl"
              onKeyDown={(ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); if (draft.trim() || files.length) send.mutate() } }} />
            <Button size="icon" className="h-[42px] w-[42px] shrink-0 rounded-xl" disabled={(!draft.trim() && files.length === 0) || send.isPending} onClick={() => send.mutate()}>
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      ) : (
        <div className="border-t border-border/60 bg-card p-3 text-center text-xs text-muted-foreground">
          This issue is {issue.status.toLowerCase()}.
          {canManage && <Button variant="link" size="sm" className="ml-1 h-auto p-0 text-xs" onClick={() => shiftIssuesApi.setStatus(issue.id, "IN_PROGRESS").then(onChanged)}>Reopen</Button>}
        </div>
      )}
    </>
  )
}

function ThreadItem({ e, mine, onOpenImage }: { e: ShiftIssueEvent; mine: boolean; onOpenImage: (uri: string) => void }) {
  if (e.type === "MESSAGE") {
    return (
      <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
        <div className={cn("max-w-[78%] rounded-2xl px-3.5 py-2 shadow-sm", mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-card text-foreground border border-border/60")}>
          {!mine && <p className="mb-0.5 text-[11px] font-semibold text-primary">{e.actorName}</p>}
          {e.body && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{e.body}</p>}
          {!!e.attachments?.length && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {e.attachments.map((a) => isImg(a.mimeType) ? (
                <button key={a.id} type="button" onClick={() => onOpenImage(a.url ?? a.fileUrl)} className="overflow-hidden rounded-lg transition-transform hover:scale-[1.03]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url ?? a.fileUrl} alt={a.fileName} className="h-24 w-24 rounded-lg object-cover" />
                </button>
              ) : (<a key={a.id} href={a.url ?? a.fileUrl} target="_blank" rel="noreferrer" className="text-xs underline">{a.fileName}</a>))}
            </div>
          )}
        </div>
        <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">{fmt(e.at)}</span>
      </div>
    )
  }
  const reasonSuffix = e.body ? ` — ${e.body}` : ""
  const label =
    e.type === "CREATED" ? `${e.actorName} reported this issue` :
    e.type === "ACKNOWLEDGED" ? `${e.actorName} acknowledged` :
    e.type === "ASSIGNED" ? `Dispatched to ${e.metadata?.assignedToName ?? "someone"}` :
    e.type === "RESOLVED" ? `${e.actorName} marked it resolved${reasonSuffix}` :
    e.type === "REOPENED" ? `${e.actorName} reopened it` :
    e.type === "CLOSED" ? `${e.actorName} closed it${reasonSuffix}` : `${e.actorName} updated the issue${reasonSuffix}`
  return (
    <div className="flex justify-center">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-[11px] text-muted-foreground">
        <Cog className="h-3 w-3" />{label}<span className="opacity-50">· {fmt(e.at)}</span>
      </span>
    </div>
  )
}
