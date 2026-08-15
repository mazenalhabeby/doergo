"use client"

import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Plus, ImagePlus, Trash2, FileText, X, LogOut } from "lucide-react"

import { worklogApi, uploadToS3, type WorkLogNote } from "@/lib/api"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
const isImg = (m: string) => m.startsWith("image/")
const MAX_FILES = 5

/**
 * "What I did" timeline for one attendance session — a vertical timeline of
 * timestamped notes, each carrying ITS OWN photos/files. `editable` adds a
 * composer (own active session / manager) that creates the note then uploads
 * each photo direct to S3 (presign → PUT → confirm).
 */
export function WorkLogTimeline({ entryId, editable, memberName, clockOutNote }: { entryId: string; editable?: boolean; memberName?: string; clockOutNote?: string | null }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ["worklog", entryId], queryFn: () => worklogApi.list(entryId) })
  const notes = q.data ?? []
  const invalidate = () => qc.invalidateQueries({ queryKey: ["worklog", entryId] })

  const [draft, setDraft] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const submit = async () => {
    const body = draft.trim()
    if (!body && files.length === 0) return
    setBusy(true)
    try {
      const note = await worklogApi.addNote(entryId, { body: body || t("worklog.photoNote", "(photo)") })
      for (const f of files) {
        const pre = await worklogApi.presignAttachment(note.id, f.name, f.type)
        await uploadToS3(pre.uploadUrl, f)
        await worklogApi.confirmAttachment(note.id, { fileKey: pre.fileKey, fileUrl: pre.fileUrl, fileName: f.name, fileSize: f.size, mimeType: f.type })
      }
      setDraft(""); setFiles([]); invalidate()
    } catch (e: any) {
      notify.error(e?.message || t("common.error", "Something went wrong"))
    } finally {
      setBusy(false)
    }
  }

  const delNote = useMutation({
    mutationFn: (id: string) => worklogApi.deleteNote(id),
    onSuccess: invalidate,
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <div className="space-y-3">
      {q.isLoading ? (
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading", "Loading…")}</div>
      ) : (
        <>
        {notes.length > 0 && (
        <ol className="relative">
          {notes.map((n: WorkLogNote, i) => (
            <li key={n.id} className="group relative flex gap-3 pb-3 last:pb-0">
              {/* Timeline rail: dot + connector */}
              <div className="relative flex w-2 flex-col items-center pt-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-primary ring-4 ring-primary/10" />
                {i < notes.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
              </div>
              {/* Note card — carries its own time + text + photos */}
              <div className="min-w-0 flex-1 rounded-xl border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="text-xs font-semibold tabular-nums text-muted-foreground">{fmtTime(n.at)}</span>
                    {n.author?.name && (
                      <span className="truncate text-xs text-muted-foreground">· {n.author.name}</span>
                    )}
                    {n.byManager && (
                      <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {t("worklog.byManager", "added by manager")}
                      </span>
                    )}
                  </div>
                  {editable && (
                    <button onClick={() => delNote.mutate(n.id)} disabled={delNote.isPending}
                      className="rounded p-1 text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">{n.body}</p>
                {n.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {n.attachments.map((a) =>
                      isImg(a.mimeType) ? (
                        <a key={a.id} href={a.url ?? a.fileUrl} target="_blank" rel="noreferrer" className="block h-16 w-16 overflow-hidden rounded-lg border border-border transition-transform hover:scale-[1.04]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.url ?? a.fileUrl} alt={a.fileName} className="h-full w-full object-cover" />
                        </a>
                      ) : (
                        <a key={a.id} href={a.url ?? a.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-muted">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" /> <span className="max-w-[140px] truncate">{a.fileName}</span>
                        </a>
                      ),
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
        )}

        {/* The clock-out summary — always last, framed as the end-of-shift note. */}
        {clockOutNote && (
          <div className="flex gap-3">
            <div className="relative flex w-2 flex-col items-center pt-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/70 ring-4 ring-muted" />
            </div>
            <div className="min-w-0 flex-1 rounded-xl border border-border bg-muted/40 p-3">
              <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <LogOut className="h-3.5 w-3.5" /> {t("worklog.clockOutNote", "Clock-out note")}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-foreground">{clockOutNote}</p>
            </div>
          </div>
        )}

        {notes.length === 0 && !clockOutNote && (
          <p className="py-2 text-sm text-muted-foreground">{t("worklog.empty", "Nothing logged yet.")}</p>
        )}
        </>
      )}

      {editable && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-2.5">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
            placeholder={memberName
              ? t("worklog.placeholderFor", { name: memberName, defaultValue: "What did {{name}} do? e.g. finished with the machine" })
              : t("worklog.placeholder", "What did you just do? e.g. finished with the machine")}
            className="resize-none bg-background" />
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-foreground">
                  <span className="max-w-[120px] truncate">{f.name}</span>
                  <button onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden"
            onChange={(e) => { setFiles((p) => [...p, ...Array.from(e.target.files ?? [])].slice(0, MAX_FILES)); e.currentTarget.value = "" }} />
          <div className="flex items-center justify-between">
            <Button type="button" variant="ghost" size="sm" disabled={files.length >= MAX_FILES} onClick={() => fileRef.current?.click()}>
              <ImagePlus className="mr-1.5 h-4 w-4" /> {t("worklog.photo", "Photo")}
            </Button>
            <Button size="sm" disabled={busy || (!draft.trim() && files.length === 0)} onClick={submit}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />} {t("worklog.add", "Add")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
