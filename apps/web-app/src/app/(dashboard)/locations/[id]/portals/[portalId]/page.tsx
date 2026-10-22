"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Building2 } from "lucide-react"
import { accessAllows, isAdmin } from "@hbcfield/shared/client"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import {
  portalAdminApi,
  type PortalIntakeCategory,
  type Customer,
  type PortalCategoryInput,
  type PortalRequestView,
} from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { useActiveSpaces } from "@/hooks/use-space-directory"
import { ConfirmDialog, ConfirmTargetDialog } from "@/components/common/confirm-dialog"
import { TPL_BY_KEY, EMPTY_CAT } from "./_lib/portal-templates"
import { PortalHeader } from "./_components/portal-header"
import { PortalCoverPanel } from "./_components/portal-cover-panel"
import { PortalTabs } from "./_components/portal-tabs"
import { PortalDangerZone } from "./_components/portal-danger-zone"
import { ChangePortalTypeDialog } from "./_components/change-portal-type-dialog"
import { DeletePortalDialog } from "./_components/delete-portal-dialog"
import { CategoryDialog } from "./_components/category-dialog"
import { TriageRequestDialog, type TriageForm } from "./_components/triage-request-dialog"
import { InviteClientDialog } from "./_components/invite-client-dialog"

/** One client portal: its requests, clients and categories, its cover, and the dialogs that change them. */
export default function PortalDetailPage() {
  const params = useParams<{ id: string; portalId: string }>()
  const spaceId = params.id
  const portalId = params.portalId
  const qc = useQueryClient()
  const router = useRouter()
  const { t } = useTranslation()
  // Back button + post-delete return land on this workspace's portals — which
  // is a navbar route again: the portal tab moved out of the space settings.
  const backToSpace = () => router.push(`/portals?space=${spaceId}`)

  /*
    Three trusts, each asked in THIS workspace exactly as the routes ask them
    (portal-admin.controller): reading the portal opens the page; answering
    routes a request into work; managing configures it — categories, cover,
    type, its client register. Inviting clients stays the organization's own
    (`@DenyExternal`). Somebody who only reads sees the requests, nothing more.
  */
  const { user } = useAuth()
  const holdsHere = (key: string) =>
    !!user &&
    (isAdmin(user) ||
      (user as unknown as Record<string, unknown>)[key] === true ||
      accessAllows(user.access as never, key as never, spaceId))
  const mayManage = holdsHere("canManagePortals")
  const mayAnswer = mayManage || holdsHere("canAnswerPortal")
  const mayInvite = mayManage && user?.isExternal !== true

  const portalQ = useQuery({
    queryKey: keys.portal.detail(portalId),
    queryFn: () => portalAdminApi.getPortal(portalId),
  })
  const residentsQ = useQuery({
    queryKey: keys.portal.residents(portalId),
    queryFn: () => portalAdminApi.residents(portalId),
    enabled: mayManage,
  })
  const requestsQ = useQuery({
    queryKey: keys.portal.allRequests(portalId),
    queryFn: () => portalAdminApi.portalRequests(portalId),
  })
  // Triage lookups (spaces to route to, flows/task-types, workers). Small + cached.
  const { data: spaces = [] } = useActiveSpaces()
  // This portal belongs to the space in the URL (the list that led here is
  // filtered by it), so requests route here — no cross-space re-pointing.
  const ownerSpaceName = spaces.find((s) => s.id === spaceId)?.name
  const portal = portalQ.data
  const categories = portal?.categories ?? []
  const meta = TPL_BY_KEY[portal?.templateKey ?? ""] ?? TPL_BY_KEY.rental
  const inv = (key: QueryKey) => qc.invalidateQueries({ queryKey: key })

  // Switch type / delete portal
  const [typePickerOpen, setTypePickerOpen] = useState(false)
  const [delPortalOpen, setDelPortalOpen] = useState(false)
  const [delConfirmText, setDelConfirmText] = useState("")

  // Categories
  const [catEdit, setCatEdit] = useState<PortalIntakeCategory | "new" | null>(null)
  const [catForm, setCatForm] = useState<PortalCategoryInput>(EMPTY_CAT)
  const [catRemove, setCatRemove] = useState<PortalIntakeCategory | null>(null)
  const openNewCat = () => {
    setCatForm(EMPTY_CAT)
    setCatEdit("new")
  }
  const openEditCat = (c: PortalIntakeCategory) => {
    setCatForm({
      label: c.label,
      icon: c.icon ?? "plus",
      color: c.color ?? "slate",
      urgent: c.urgent,
      team: c.team ?? "",
      issues: c.issues ?? [],
    })
    setCatEdit(c)
  }
  const delCatM = useMutation({
    mutationFn: (cid: string) => portalAdminApi.deleteCategory(cid),
    onSuccess: () => {
      inv(keys.portal.detail(portalId))
      setCatRemove(null)
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  // Triage a pending request → live task (space + flow + priority + worker)
  const [triageReq, setTriageReq] = useState<PortalRequestView | null>(null)
  const [triageForm, setTriageForm] = useState<TriageForm>({
    spaceId: "",
    workflowId: "",
    priority: "",
    assignedToId: "",
  })
  const openTriage = (r: PortalRequestView) => {
    // Pre-route to the portal's linked space (if any) so the admin only confirms
    // the flow + assigns — no re-picking the space for every request.
    setTriageForm({
      spaceId: r.suggestedSpaceId ?? r.spaceId ?? "",
      workflowId: "",
      priority: r.priority || "MEDIUM",
      assignedToId: r.assignedToId ?? "",
    })
    setTriageReq(r)
  }
  // Remove a client from the portal (revoke access + detach)
  const [clientToRemove, setClientToRemove] = useState<Customer | null>(null)
  const removeClientM = useMutation({
    mutationFn: (cid: string) => portalAdminApi.removeResident(cid),
    onSuccess: () => {
      inv(keys.portal.residents(portalId))
      setClientToRemove(null)
      notify.success(t("portal.clientRemoved", "Client removed"))
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  const [inviteOpen, setInviteOpen] = useState(false)

  const requestCount = requestsQ.data?.length ?? 0
  const clientCount = residentsQ.data?.length ?? 0
  const openCount = requestsQ.data?.filter((r) => !["COMPLETED", "CLOSED", "CANCELED"].includes(r.status)).length ?? 0

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-screen-lg mx-auto px-6 py-8">
        <PortalHeader
          portal={portal}
          meta={meta}
          openCount={openCount}
          requestCount={requestCount}
          clientCount={clientCount}
          mayManage={mayManage}
          mayInvite={mayInvite}
          onBack={backToSpace}
          onChangeType={() => setTypePickerOpen(true)}
          onInvite={() => setInviteOpen(true)}
        />

        <PortalCoverPanel portalId={portalId} portal={portal} mayManage={mayManage} />

        {/* This portal belongs to its space — requests route here automatically
            (inheriting the space's flow). No cross-space re-pointing. */}
        <div className="mb-6 flex items-center gap-2.5 rounded-2xl border border-border bg-muted/30 px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="h-4 w-4" />
          </span>
          <p className="min-w-0 text-sm text-muted-foreground">
            {t("portal.routesToThisSpace", "Requests route to")}{" "}
            <span className="font-medium text-foreground">
              {ownerSpaceName || t("portal.thisSpace", "this workspace")}
            </span>{" "}
            {t("portal.andItsFlow", "and inherit its workflow.")}
          </p>
        </div>

        <PortalTabs
          requests={requestsQ.data}
          requestsLoading={requestsQ.isLoading}
          requestCount={requestCount}
          residents={residentsQ.data}
          residentsLoading={residentsQ.isLoading}
          clientCount={clientCount}
          categories={categories}
          mayManage={mayManage}
          mayAnswer={mayAnswer}
          mayInvite={mayInvite}
          onInvite={() => setInviteOpen(true)}
          onTriage={openTriage}
          onRemoveClient={setClientToRemove}
          onNewCategory={openNewCat}
          onEditCategory={openEditCat}
          onRemoveCategory={setCatRemove}
        />

        {/* Danger zone — deleting is managing, and closed to external members (the route says both). */}
        {portal && mayManage && user?.isExternal !== true && (
          <PortalDangerZone
            onDelete={() => {
              setDelConfirmText("")
              setDelPortalOpen(true)
            }}
          />
        )}
      </div>

      {/* Change type picker — shows the current type; picking another flows into
          the reseed confirm. */}
      <ChangePortalTypeDialog
        spaceId={spaceId}
        portalId={portalId}
        currentKey={meta.key}
        open={typePickerOpen}
        onOpenChange={setTypePickerOpen}
      />

      {/* Delete portal — type-the-name to confirm */}
      <DeletePortalDialog
        spaceId={spaceId}
        portalId={portalId}
        portalName={portal?.name}
        clientCount={clientCount}
        requestCount={requestCount}
        open={delPortalOpen}
        onOpenChange={setDelPortalOpen}
        confirmText={delConfirmText}
        setConfirmText={setDelConfirmText}
        onDeleted={backToSpace}
      />

      {/* Category add/edit */}
      <CategoryDialog
        portalId={portalId}
        catEdit={catEdit}
        setCatEdit={setCatEdit}
        catForm={catForm}
        setCatForm={setCatForm}
      />

      {/* Triage a pending request → live task */}
      <TriageRequestDialog
        portalId={portalId}
        triageReq={triageReq}
        setTriageReq={setTriageReq}
        triageForm={triageForm}
        setTriageForm={setTriageForm}
        spaces={spaces}
      />

      {/* Category delete */}
      <ConfirmDialog
        open={!!catRemove}
        onOpenChange={(o) => !o && setCatRemove(null)}
        title={t("portal.deleteCategoryTitle", "Delete “{{label}}”?", { label: catRemove?.label })}
        description={t(
          "portal.deleteCategoryWarn",
          "Clients can no longer pick this category for new requests. Existing " + "requests keep their category.",
        )}
        cancelLabel={t("common.cancel", "Cancel")}
        confirmLabel={t("common.delete", "Delete")}
        onConfirm={() => catRemove && delCatM.mutate(catRemove.id)}
        destructive
        confirmDisabled={delCatM.isPending}
      />

      {/* Remove client from the portal */}
      <ConfirmTargetDialog
        target={clientToRemove}
        onClose={() => setClientToRemove(null)}
        title={t("portal.removeClientTitle", "Remove {{name}} from this portal?", { name: clientToRemove?.name })}
        description={t(
          "portal.removeClientWarn",
          "They immediately lose app access and are detached from this portal (any " +
            "apartment they held is freed). Their record and history are kept — you " +
            "can invite them again later.",
        )}
        cancelLabel={t("common.cancel", "Cancel")}
        confirmLabel={t("portal.removeClientConfirm", "Remove client")}
        mutation={removeClientM}
      />

      {/* Invite client */}
      <InviteClientDialog portalId={portalId} portal={portal} open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  )
}
