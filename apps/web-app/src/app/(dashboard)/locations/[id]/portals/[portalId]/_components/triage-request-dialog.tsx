"use client"

import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { canReceiveTasks, personName } from "@hbcfield/shared/client"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { locationsApi, portalAdminApi, type PortalRequestView } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { useWorkflows } from "@/hooks/use-workflows"

/** Where a pending request goes: the workspace, its flow, the priority and the worker. */
export type TriageForm = { spaceId: string; workflowId: string; priority: string; assignedToId: string }

/**
 * Route a pending client request into a workspace as a live task — the flow (or the workspace's default),
 * the priority, and a worker from THAT workspace's roster.
 */
export function TriageRequestDialog({
  portalId,
  triageReq,
  setTriageReq,
  triageForm,
  setTriageForm,
  spaces,
}: {
  portalId: string
  /** The request being routed; null when closed. */
  triageReq: PortalRequestView | null
  setTriageReq: (r: PortalRequestView | null) => void
  triageForm: TriageForm
  setTriageForm: React.Dispatch<React.SetStateAction<TriageForm>>
  /** The workspaces it may be routed to. */
  spaces: { id: string; name: string }[]
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const flowsQ = useWorkflows()
  const flows = flowsQ.data ?? []
  /*
    Assignable workers = ONLY the roster of the space being routed to.

    ⚠️ The ROSTER (`GET /locations/:id/members`, `mayViewSpaceRoster` — held by
    whoever assigns work there), not the member-management list
    (`/spaces/:id/members`, which needs canManageSpace): an answerer who may
    assign work but not manage the workspace was refused that list, and the
    dialog read the refusal as "No workers assigned to this workspace yet".
  */
  const spaceMembersQ = useQuery({
    queryKey: keys.locations.roster(triageForm.spaceId),
    queryFn: () => locationsApi.getAssignedMembers(triageForm.spaceId),
    enabled: !!triageReq && !!triageForm.spaceId,
    staleTime: 30000,
  })
  // Only people who can take a job — an Access Profile without Tasks is refused by the server.
  const spaceWorkers = (spaceMembersQ.data ?? []).filter((m) => m.user && canReceiveTasks(m.user as never))
  // Changing the space invalidates a previously-picked worker (may not be on the
  // new roster) — clear it so we never submit a cross-space assignee.
  const setTriageSpace = (sid: string) => setTriageForm((f) => ({ ...f, spaceId: sid, assignedToId: "" }))
  const triageM = useMutation({
    mutationFn: () =>
      portalAdminApi.triageRequest(triageReq!.id, {
        spaceId: triageForm.spaceId,
        // "" workflow = use the chosen space's default flow (send undefined so the
        // backend inherits it); a real id overrides it (dynamic flow).
        workflowId: triageForm.workflowId || undefined,
        priority: triageForm.priority || undefined,
        assignedToId: triageForm.assignedToId || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.portal.allRequests(portalId) })
      setTriageReq(null)
      notify.success(t("portal.requestRouted", "Request routed"))
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  return (
    <Dialog open={!!triageReq} onOpenChange={(o) => !o && setTriageReq(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("portal.triageTitle", "Route request")}</DialogTitle>
          <DialogDescription>
            {t(
              "portal.triageHint",
              "Send this request into a workspace and choose how it should flow, then " + "assign a worker.",
            )}
          </DialogDescription>
        </DialogHeader>
        {triageReq && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <p className="text-sm font-medium text-foreground truncate">{triageReq.title}</p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                <span className="font-mono">{triageReq.reference}</span>
                {triageReq.customerName ? ` · ${triageReq.customerName}` : ""}
                {triageReq.unitName ? ` · ${triageReq.unitName}` : ""}
              </p>
              {triageReq.unitAddress && (
                <p className="text-xs text-muted-foreground mt-1">📍 {triageReq.unitAddress}</p>
              )}
              {triageReq.description && (
                <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap line-clamp-4">
                  {triageReq.description}
                </p>
              )}
            </div>
            <div>
              <Label>
                {t("portal.triageSpace", "Workspace")} <span className="text-red-500">*</span>
              </Label>
              <select
                value={triageForm.spaceId}
                onChange={(e) => setTriageSpace(e.target.value)}
                className={"mt-1 w-full h-10 rounded-md border border-border bg-background px-3 " + "text-sm"}
              >
                <option value="">{t("portal.triagePickSpace", "Pick a workspace…")}</option>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("portal.triageFlow", "Flow")}</Label>
                <select
                  value={triageForm.workflowId}
                  onChange={(e) => setTriageForm({ ...triageForm, workflowId: e.target.value })}
                  className={"mt-1 w-full h-10 rounded-md border border-border bg-background px-3 " + "text-sm"}
                >
                  <option value="">{t("portal.triageFlowDefault", "Workspace default")}</option>
                  {flows.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{t("portal.triagePriority", "Priority")}</Label>
                <select
                  value={triageForm.priority}
                  onChange={(e) => setTriageForm({ ...triageForm, priority: e.target.value })}
                  className={"mt-1 w-full h-10 rounded-md border border-border bg-background px-3 " + "text-sm"}
                >
                  {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
                    <option key={p} value={p}>
                      {p.charAt(0) + p.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label>{t("portal.triageWorker", "Assign worker")}</Label>
              <select
                value={triageForm.assignedToId}
                disabled={!triageForm.spaceId}
                onChange={(e) => setTriageForm({ ...triageForm, assignedToId: e.target.value })}
                className={
                  "mt-1 w-full h-10 rounded-md border border-border bg-background px-3 " + "text-sm disabled:opacity-50"
                }
              >
                <option value="">
                  {!triageForm.spaceId
                    ? t("portal.triagePickSpaceFirst", "Pick a workspace first")
                    : t("portal.triageUnassigned", "Leave unassigned")}
                </option>
                {spaceWorkers.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {personName(m.user)}
                  </option>
                ))}
              </select>
              {triageForm.spaceId && !spaceMembersQ.isLoading && spaceWorkers.length === 0 ? (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  {t(
                    "portal.triageNoMembers",
                    "No workers assigned to this workspace yet. Add members to the workspace, " +
                      "or leave unassigned.",
                  )}
                </p>
              ) : null}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setTriageReq(null)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button disabled={!triageForm.spaceId || triageM.isPending} onClick={() => triageM.mutate()}>
            {triageM.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("portal.triageAccept", "Accept & route")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
