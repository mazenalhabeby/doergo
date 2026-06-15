"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2, Workflow as WorkflowIcon } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { workflowsApi, type StatusWorkflow, type WorkflowStatus } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { notify } from "@/lib/toast"
import { getStatusCapabilities } from "@hbcfield/shared/client"

/** Slugify a status name into a machine key (e.g. "In transit" → IN_TRANSIT). */
function toKey(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "")
}

export default function TaskTypesPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const canManage = !!user?.canManageUsers

  const { data: workflows, isLoading } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => workflowsApi.list(),
    enabled: canManage,
  })

  const [newName, setNewName] = useState("")
  const refetch = () => qc.invalidateQueries({ queryKey: ["workflows"] })

  const createMut = useMutation({
    mutationFn: (name: string) => workflowsApi.create({ name }),
    onSuccess: () => { notify.success("Type created"); setNewName(""); refetch() },
    onError: (e) => notify.error(e instanceof Error ? e.message : "Couldn't create type"),
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => workflowsApi.delete(id),
    onSuccess: () => { notify.success("Type deleted"); refetch() },
    onError: (e) => notify.error(e instanceof Error ? e.message : "Couldn't delete"),
  })

  if (!canManage) {
    return <div className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-muted-foreground">You don&apos;t have access to manage task types.</div>
  }

  const list: StatusWorkflow[] = workflows ?? []

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2"><WorkflowIcon className="h-6 w-6 text-primary" /> Task Types</h1>
          <p className="text-sm text-muted-foreground">Each type is a status flow + the widgets each step uses.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New type name…"
            className="h-9 w-44 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          />
          <Button size="sm" className="gap-1.5" disabled={!newName.trim() || createMut.isPending} onClick={() => createMut.mutate(newName.trim())}>
            <Plus className="h-3.5 w-3.5" /> New Type
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-4">
          {list.map((wf) => (
            <WorkflowCard key={wf.id} wf={wf} onChanged={refetch} onDelete={() => deleteMut.mutate(wf.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

const CAP_LABEL: Record<string, string> = {
  gps: "📍 GPS", timer: "⏱ Timer", checklist: "✅ Checklist",
  photos: "📷 Photos", signature: "✍️ Signature", report: "📝 Report", form: "🗒 Form",
}
const ALL_CAPS = ["gps", "timer", "checklist", "photos", "signature", "report", "form"]

function WorkflowCard({ wf, onChanged, onDelete }: { wf: StatusWorkflow; onChanged: () => void; onDelete: () => void }) {
  const [statusName, setStatusName] = useState("")
  const statuses = [...(wf.statuses ?? [])].sort((a, b) => a.position - b.position)

  const toggleCap = useMutation({
    mutationFn: ({ statusId, capabilities }: { statusId: string; capabilities: string[] }) =>
      workflowsApi.updateStatus(wf.id, statusId, { capabilities }),
    onSuccess: onChanged,
    onError: (e) => notify.error(e instanceof Error ? e.message : "Couldn't update"),
  })

  const addStatus = useMutation({
    mutationFn: () =>
      workflowsApi.addStatus(wf.id, {
        name: statusName.trim(),
        key: toKey(statusName),
        color: "#3b82f6",
        position: statuses.length,
        transitions: [],
      }),
    onSuccess: () => { notify.success("Step added"); setStatusName(""); onChanged() },
    onError: (e) => notify.error(e instanceof Error ? e.message : "Couldn't add step"),
  })

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">{wf.name}</h2>
        {wf.isDefault && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">DEFAULT</span>}
        {!wf.isDefault && (
          <button onClick={onDelete} className="ml-auto rounded-lg border border-border p-1.5 text-muted-foreground hover:text-red-600" title="Delete type">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Flow: statuses + their per-step capabilities */}
      <div className="flex flex-wrap items-stretch gap-2">
        {statuses.length === 0 && <span className="text-xs text-muted-foreground">No steps yet.</span>}
        {statuses.map((s: WorkflowStatus) => {
          const caps = s.capabilities ?? getStatusCapabilities(wf.name, s.key)
          return (
            <div key={s.id} className="rounded-xl border border-border px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <span className="size-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name}{s.isFinal ? " ✓" : ""}
              </div>
              {/* Toggle which widgets are active at this step */}
              <div className="mt-1.5 flex flex-wrap gap-1">
                {ALL_CAPS.map((c) => {
                  const on = caps.includes(c)
                  return (
                    <button
                      key={c}
                      disabled={toggleCap.isPending}
                      onClick={() =>
                        toggleCap.mutate({ statusId: s.id, capabilities: on ? caps.filter((x) => x !== c) : [...caps, c] })
                      }
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground/50 hover:text-muted-foreground"}`}
                    >
                      {CAP_LABEL[c] ?? c}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add a step */}
      <div className="mt-3 flex items-center gap-2">
        <input
          value={statusName}
          onChange={(e) => setStatusName(e.target.value)}
          placeholder="Add a step (e.g. In transit)…"
          className="h-8 flex-1 rounded-lg border border-border bg-background px-3 text-xs text-foreground"
        />
        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={!statusName.trim() || addStatus.isPending} onClick={() => addStatus.mutate()}>
          <Plus className="h-3 w-3" /> Step
        </Button>
      </div>
    </div>
  )
}
