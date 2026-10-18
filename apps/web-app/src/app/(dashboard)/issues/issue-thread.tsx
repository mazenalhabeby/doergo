"use client"

import { personName } from "@hbcfield/shared/client"
import { useEffect, useRef, useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Loader2, Send, Check, UserPlus, CircleCheck, Cog, ChevronLeft, ImagePlus } from "lucide-react"
import {
  shiftIssuesApi,
  employeesApi,
  uploadToS3,
  type ShiftIssue,
  type ShiftIssueEvent,
  type EmployeeListItem,
  type WorkLogAttachmentInput,
} from "@/lib/api"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { AttachmentPicker, ImageLightbox, PendingFileChips } from "@/components/pending-attachments"
import { Textarea } from "@/components/ui/textarea"
import { keys } from "@/lib/query-keys"
import { SEV_DOT, SEV_TEXT, RESOLVE_REASONS, fmt, isImg, Chip } from "./issues-helpers"
import { ChoiceChip } from "@/components/ui/choice-chip"

/** One shift issue's thread, moved here unchanged from the issues page. */
export function IssueThread(
  {
    issue,
    canManage,
    currentUserId,
    onChanged,
    onBack
  }: { issue: ShiftIssue; canManage: boolean; currentUserId?: string; onChanged: () => void; onBack: () => void }) {
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

  const membersQ = useQuery({
    queryKey: keys.shiftIssues.assignables(),
    queryFn: () => employeesApi.list({ limit: 100 }),
    enabled: assignOpen
  })
  const members: EmployeeListItem[] = membersQ.data?.data ?? []

  const send = useMutation({
    mutationFn: async () => {
      const attachments: WorkLogAttachmentInput[] = []
      for (const f of files) {
        const pre = await shiftIssuesApi.presignAttachment(issue.id, f.name, f.type)
        await uploadToS3(pre.uploadUrl, f)
        attachments.push({ fileKey: pre.fileKey, fileUrl: pre.fileUrl, fileName: f.name, fileSize: f.size, mimeType: f.type })
      }
      return shiftIssuesApi.message(issue.id, { body: draft.trim(), attachments })
    },
    onSuccess: () => { setDraft(""); setFiles([]); onChanged() },
    onError: (e: Error) => notify.error(e.message || "Failed to send"),
  })
  const act = (fn: () => Promise<unknown>) =>
    fn().then(onChanged).catch((e) => notify.error(e instanceof Error ? e.message : "Action failed"))
  const closed = ["RESOLVED", "CLOSED", "CANCELED"].includes(issue.status)

  return (
    <>
      <header className="border-b border-border/60 px-4 py-3.5 md:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <button
              onClick={onBack}
              className={"mt-0.5 shrink-0 rounded p-1 text-muted-foreground hover:bg-accent " +
                "md:hidden"}><ChevronLeft className="h-4 w-4" /></button>
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => act(() => shiftIssuesApi.acknowledge(
                    issue.id))}><Check className="mr-1.5 h-3.5 w-3.5" /> Acknowledge</Button>
              )}
              <div className="relative">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAssignOpen((v) => !v)}><UserPlus
                    className="mr-1.5 h-3.5 w-3.5"
                  /> {issue.assigneeName ? "Reassign" : "Dispatch"}</Button>
                {assignOpen && (
                  <div
                    className={"absolute right-0 z-10 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg " +
                      "border border-border bg-popover p-1 shadow-lg"}>
                    {membersQ.isLoading ? (
                      <div className="p-3 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" /></div>
                    ) : members.length === 0 ? (<p className="p-2 text-xs text-muted-foreground">No members</p>) : members.map((m) => (
                      <button key={m.id} onClick={() => { setAssignOpen(false); act(() => shiftIssuesApi.assign(issue.id, m.id)) }}
                        className="block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-accent">{personName(m)}</button>
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
                        <ChoiceChip key={r} type="button" on={reason === r} onClick={() => setReason(r)}>
                          {r}
                        </ChoiceChip>
                      ))}
                    </div>
                    <Textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                      placeholder="Add a note / excuse…"
                      className="mb-2 resize-none text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => { setResolveOpen(false); setReason("") }}>Cancel</Button>
                      <Button
                        size="sm"
                        onClick={() => { setResolveOpen(
                          false); const r = reason.trim(); setReason(
                            ""); act(() => shiftIssuesApi.setStatus(issue.id, "RESOLVED", r || undefined)) }}>Resolve</Button>
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
      <ImageLightbox src={viewer} onClose={() => setViewer(null)} />

      {!closed ? (
        <div className="border-t border-border/60 bg-card p-3">
          <PendingFileChips files={files} setFiles={setFiles} className="mb-2" />
          <div className="flex items-end gap-2">
            <AttachmentPicker inputRef={fileRef} setFiles={setFiles} max={5} />
            <Button
              size="icon"
              variant="ghost"
              className="h-[42px] w-[42px] shrink-0"
              disabled={files.length >= 5}
              onClick={() => fileRef.current?.click()}>
              <ImagePlus className="h-4 w-4" />
            </Button>
            <Textarea value={draft} onChange={(ev) => setDraft(ev.target.value)} rows={1}
              placeholder="Message on this issue…" className="max-h-32 min-h-[42px] resize-none rounded-xl"
              onKeyDown={(ev) => { if (ev.key === "Enter" &&
                !ev.shiftKey) { ev.preventDefault(); if (draft.trim() || files.length) send.mutate() } }} />
            <Button
              size="icon"
              className="h-[42px] w-[42px] shrink-0 rounded-xl"
              disabled={(!draft.trim() && files.length === 0) || send.isPending}
              onClick={() => send.mutate()}>
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      ) : (
        <div className="border-t border-border/60 bg-card p-3 text-center text-xs text-muted-foreground">
          This issue is {issue.status.toLowerCase()}.
          {canManage &&
            <Button
              variant="link"
              size="sm"
              className="ml-1 h-auto p-0 text-xs"
              onClick={() => shiftIssuesApi.setStatus(issue.id, "IN_PROGRESS").then(onChanged)}>Reopen</Button>}
        </div>
      )}
    </>
  )
}

export function ThreadItem({ e, mine, onOpenImage }: { e: ShiftIssueEvent; mine: boolean; onOpenImage: (uri: string) => void }) {
  if (e.type === "MESSAGE") {
    return (
      <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
        <div
          className={cn(
            "max-w-[78%] rounded-2xl px-3.5 py-2 shadow-sm",
            mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-card text-foreground border border-border/60")}>
          {!mine && <p className="mb-0.5 text-[11px] font-semibold text-primary">{e.actorName}</p>}
          {e.body && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{e.body}</p>}
          {!!e.attachments?.length && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {e.attachments.map((a) => isImg(a.mimeType) ? (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onOpenImage(a.url ?? a.fileUrl)}
                  className="overflow-hidden rounded-lg transition-transform hover:scale-[1.03]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.url ?? a.fileUrl}
                    alt={a.fileName}
                    width={96}
                    height={96}
                    loading="lazy"
                    decoding="async"
                    className="h-24 w-24 rounded-lg object-cover"
                  />
                </button>
              ) : (<a
                key={a.id}
                href={a.url ?? a.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline">{a.fileName}</a>))}
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
