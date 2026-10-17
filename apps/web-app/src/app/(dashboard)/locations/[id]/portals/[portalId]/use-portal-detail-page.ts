"use client"

import { keys } from "@/lib/query-keys"
import { useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  portalAdminApi,
  locationsApi,
  workflowsApi,
  type PortalIntakeCategory,
  type Customer,
  type PortalCategoryInput,
  type PortalRequestView,
} from "@/lib/api"
import { canReceiveTasks } from "@hbcfield/shared/client"
import { useSpaceModules } from "@/hooks/use-space-modules"
import { notify } from "@/lib/toast"
import { accessAllows, isAdmin } from "@hbcfield/shared/client"
import { useAuth } from "@/contexts/auth-context"
import { useActiveSpaces } from "@/hooks/use-space-directory"

export const TEMPLATES = [
  { key: "rental", label: "Rental / Property", badge: "Rental", accent: "emerald" },
  { key: "logistics", label: "Logistics / Delivery", badge: "Logistics", accent: "orange" },
  { key: "workplace", label: "Workplace / Facilities", badge: "Workplace", accent: "cyan" },
]

export const TPL_BY_KEY = Object.fromEntries(TEMPLATES.map((x) => [x.key, x]))

export const EMPTY_CAT: PortalCategoryInput = { label: "", icon: "plus", color: "slate", urgent: false, team: "", issues: [] }

/** PortalDetailPage's state and handlers — everything before its markup, moved here unchanged. */
export function usePortalDetailPage() {
  const params = useParams<{ id: string; portalId: string }>()
  const spaceId = params.id
  const portalId = params.portalId
  const qc = useQueryClient()
  const router = useRouter()
  const { t } = useTranslation()
  // Back button + post-delete return land on this workspace's portals — which
  // is a navbar route again: the portal tab moved out of the space settings.
  const backToSpace = () => router.push(`/portals?space=${spaceId}`)
  // The Apartment entity used to need the Apartments module; that module is
  // retired and its records live in Assets now. A portal's own units are part
  // of the portal, so this gates on the portal itself.
  const { hasModule } = useSpaceModules(spaceId)
  const spaceHasApartments = hasModule("b2c_portal")

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

  const portalQ = useQuery({ queryKey: keys.portal.detail(portalId), queryFn: () => portalAdminApi.getPortal(portalId) })
  const residentsQ = useQuery({
    queryKey: keys.portal.residents(portalId),
    queryFn: () => portalAdminApi.residents(portalId),
    enabled: mayManage
  })
  const requestsQ = useQuery({ queryKey: keys.portal.allRequests(portalId), queryFn: () => portalAdminApi.portalRequests(portalId) })
  // Triage lookups (spaces to route to, flows/task-types, workers). Small + cached.
  const { data: spaces = [] } = useActiveSpaces()
  const flowsQ = useQuery({ queryKey: keys.workflows.lists(), queryFn: () => workflowsApi.list(), staleTime: 60000 })
  const flows = flowsQ.data ?? []
  // This portal belongs to the space in the URL (the list that led here is
  // filtered by it), so requests route here — no cross-space re-pointing.
  const ownerSpaceName = spaces.find((s) => s.id === spaceId)?.name
  const portal = portalQ.data
  const categories = portal?.categories ?? []
  const meta = TPL_BY_KEY[portal?.templateKey ?? ""] ?? TPL_BY_KEY.rental
  const inv = (key: QueryKey) => qc.invalidateQueries({ queryKey: key })

  // Switch type / delete portal
  const [typePickerOpen, setTypePickerOpen] = useState(false)
  const [switchOpen, setSwitchOpen] = useState<string | null>(null)
  const switchM = useMutation({
    mutationFn: (templateKey: string) => portalAdminApi.updatePortal(portalId, { templateKey, reseed: true }),
    onSuccess: () => { inv(keys.portal.detail(portalId)); setSwitchOpen(null); notify.success(t("portal.switched", "Type switched")) },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })
  const delPortalM = useMutation({
    mutationFn: () => portalAdminApi.deletePortal(portalId),
    onSuccess: () => { qc.invalidateQueries({
      queryKey: keys.spaces.portals(spaceId)
    }); notify.success(t("portal.deleted", "Portal deleted")); backToSpace() },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })
  const [delPortalOpen, setDelPortalOpen] = useState(false)
  const [delConfirmText, setDelConfirmText] = useState("")
  const canDeletePortal = !!portal && delConfirmText.trim() === portal.name

  // Categories
  const [catEdit, setCatEdit] = useState<PortalIntakeCategory | "new" | null>(null)
  const [catForm, setCatForm] = useState<PortalCategoryInput>(EMPTY_CAT)
  const [catRemove, setCatRemove] = useState<PortalIntakeCategory | null>(null)
  const openNewCat = () => { setCatForm(EMPTY_CAT); setCatEdit("new") }
  const openEditCat = (c: PortalIntakeCategory) => { setCatForm({
    label: c.label,
    icon: c.icon ?? "plus",
    color: c.color ?? "slate",
    urgent: c.urgent,
    team: c.team ?? "",
    issues: c.issues ?? []
  }); setCatEdit(c) }
  const saveCatM = useMutation({
    mutationFn: () => catEdit === "new"
      ? portalAdminApi.createCategory({ ...catForm, portalId, key: catForm.label.toLowerCase().replace(/[^a-z0-9]+/g, "_") })
      : portalAdminApi.updateCategory((catEdit as PortalIntakeCategory).id, catForm),
    onSuccess: () => { inv(keys.portal.detail(portalId)); setCatEdit(null) },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })
  const delCatM = useMutation({
    mutationFn: (cid: string) => portalAdminApi.deleteCategory(cid),
    onSuccess: () => { inv(keys.portal.detail(portalId)); setCatRemove(null) },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  // Triage a pending request → live task (space + flow + priority + worker)
  const [triageReq, setTriageReq] = useState<PortalRequestView | null>(null)
  const [
    triageForm,
    setTriageForm] = useState<{ spaceId: string; workflowId: string; priority: string; assignedToId: string }>({ spaceId: "", workflowId: "", priority: "", assignedToId: "" })
  const openTriage = (r: PortalRequestView) => {
    // Pre-route to the portal's linked space (if any) so the admin only confirms
    // the flow + assigns — no re-picking the space for every request.
    setTriageForm({ spaceId: r.suggestedSpaceId ?? r.spaceId ?? "", workflowId: "", priority: r.priority || "MEDIUM", assignedToId: r.assignedToId ?? "" })
    setTriageReq(r)
  }
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
    mutationFn: () => portalAdminApi.triageRequest(triageReq!.id, {
      spaceId: triageForm.spaceId,
      // "" workflow = use the chosen space's default flow (send undefined so the
      // backend inherits it); a real id overrides it (dynamic flow).
      workflowId: triageForm.workflowId || undefined,
      priority: triageForm.priority || undefined,
      assignedToId: triageForm.assignedToId || undefined,
    }),
    onSuccess: () => { inv(keys.portal.allRequests(portalId)); setTriageReq(null); notify.success(t("portal.requestRouted", "Request routed")) },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  // Cover image (client-home background)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const uploadCoverM = useMutation({
    mutationFn: (file: File) => portalAdminApi.uploadCover(portalId, file),
    onSuccess: () => { inv(keys.portal.detail(portalId)); notify.success(t("portal.coverUpdated", "Cover image updated")) },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })
  const removeCoverM = useMutation({
    mutationFn: () => portalAdminApi.removeCover(portalId),
    onSuccess: () => { inv(keys.portal.detail(portalId)); notify.success(t("portal.coverRemoved", "Cover image removed")) },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  // Remove a client from the portal (revoke access + detach)
  const [clientToRemove, setClientToRemove] = useState<Customer | null>(null)
  const removeClientM = useMutation({
    mutationFn: (cid: string) => portalAdminApi.removeResident(cid),
    onSuccess: () => { inv(keys.portal.residents(portalId)); setClientToRemove(null); notify.success(t("portal.clientRemoved", "Client removed")) },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  // Invite client — pick an existing customer + apartment, or create either using
  // the SAME models (CustomerForm / ApartmentDialog) so nothing is re-implemented.
  const [inviteOpen, setInviteOpen] = useState(false)
  const [unitChoice, setUnitChoice] = useState("")
  const [customerChoice, setCustomerChoice] = useState("")
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const availUnitsQ = useQuery({ queryKey: keys.portal.availableUnits(portalId), queryFn: () => portalAdminApi.availableUnits(portalId), enabled: inviteOpen })
  const availUnits = availUnitsQ.data ?? []
  const availCustomersQ = useQuery({ queryKey: keys.portal.availableCustomers(portalId), queryFn: () => portalAdminApi.availableCustomers(portalId), enabled: inviteOpen })
  const availCustomers = availCustomersQ.data ?? []
  const resetInvite = () => { setInviteOpen(false); setCode(null); setUnitChoice(""); setCustomerChoice("") }
  const inviteM = useMutation({
    mutationFn: () => portalAdminApi.inviteResident(portalId, { customerId: customerChoice, unitId: unitChoice }),
    onSuccess: (r) => {
      setCode(r.code ?? null); inv(keys.portal.residents(portalId))
      qc.invalidateQueries({ queryKey: keys.portal.availableUnits(portalId) })
      qc.invalidateQueries({ queryKey: keys.portal.availableCustomers(portalId) })
      notify.success(t("portal.inviteCreated", "Invitation created"))
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : t("common.error", "Something went wrong")),
  })

  const requestCount = requestsQ.data?.length ?? 0
  const clientCount = residentsQ.data?.length ?? 0
  const openCount = requestsQ.data?.filter((r) => !["COMPLETED", "CLOSED", "CANCELED"].includes(r.status)).length ?? 0

  return {
    spaceId,
    router,
    t,
    backToSpace,
    spaceHasApartments,
    user,
    mayManage,
    mayAnswer,
    mayInvite,
    residentsQ,
    requestsQ,
    spaces,
    flows,
    ownerSpaceName,
    portal,
    categories,
    meta,
    typePickerOpen,
    setTypePickerOpen,
    switchOpen,
    setSwitchOpen,
    switchM,
    delPortalM,
    delPortalOpen,
    setDelPortalOpen,
    delConfirmText,
    setDelConfirmText,
    canDeletePortal,
    catEdit,
    setCatEdit,
    catForm,
    setCatForm,
    catRemove,
    setCatRemove,
    openNewCat,
    openEditCat,
    saveCatM,
    delCatM,
    triageReq,
    setTriageReq,
    triageForm,
    setTriageForm,
    openTriage,
    spaceMembersQ,
    spaceWorkers,
    setTriageSpace,
    triageM,
    coverInputRef,
    uploadCoverM,
    removeCoverM,
    clientToRemove,
    setClientToRemove,
    removeClientM,
    inviteOpen,
    setInviteOpen,
    unitChoice,
    setUnitChoice,
    customerChoice,
    setCustomerChoice,
    code,
    copied,
    setCopied,
    availUnitsQ,
    availUnits,
    availCustomersQ,
    availCustomers,
    resetInvite,
    inviteM,
    requestCount,
    clientCount,
    openCount,
  }
}

/** What PortalDetailPage and its sections read. */
export type PortalDetailPageState = ReturnType<typeof usePortalDetailPage>
