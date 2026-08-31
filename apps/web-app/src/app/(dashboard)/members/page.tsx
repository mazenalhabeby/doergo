"use client"

import { useState, useCallback, useMemo, memo, useEffect } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  RefreshCw,
  Search,
  MoreHorizontal,
  Crown,
  Pencil,
  UserMinus,
  UserPlus,
  MapPin,
  Users,
  Mail,
  Clock,
  Timer,
  X,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Shield,
  ShieldCheck,
} from "lucide-react"
import { notify } from "@/lib/toast"
import { errorMessage } from "@/lib/errors"
import { useTranslation } from "react-i18next"

import { UserAvatar } from "@/components/user-avatar"
import { useAuth } from "@/contexts/auth-context"
// Lazy (audit M-C1). These four dialogs are ~1,455 lines that only render after a
// click, and they were being shipped in the first paint of a page whose job is a
// table. ssr:false because none of them renders on the server anyway.
const CreateInvitationDialog = dynamic(
  () => import("@/components/invitations/create-invitation-dialog").then((m) => m.CreateInvitationDialog),
  { ssr: false },
)
const ManageRolesDialog = dynamic(
  () => import("@/components/roles/manage-roles-dialog").then((m) => m.ManageRolesDialog),
  { ssr: false },
)
const EditMemberDialog = dynamic(
  () => import("./_components/edit-member-dialog").then((m) => m.EditMemberDialog),
  { ssr: false },
)
const AccessBuilder = dynamic(
  () => import("@/components/access-builder").then((m) => m.AccessBuilder),
  { ssr: false },
)
import { cn } from "@/lib/utils"
import { roleBadge, ROLE_COLOR_FALLBACK } from "@/lib/role-badge"
import {
  organizationsApi,
  type AccessRole,
  invitationsApi,
  locationsApi,
  type OrgMember,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { dateLocale } from "@/lib/format-date"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Bulk Action Bar for members
// ---------------------------------------------------------------------------

interface MemberBulkActionBarProps {
  selectedIds: Set<string>
  locations: { id: string; name: string }[]
  onClear: () => void
  onBulkRoleChange: (memberIds: string[], role: string) => void
  onBulkSpaceAssign: (memberIds: string[], locationId: string) => void
  onBulkAccess: (memberIds: string[]) => void
  onBulkRemove: (memberIds: string[]) => void
}

const MemberBulkActionBar = memo(function MemberBulkActionBar({
  selectedIds,
  locations,
  onClear,
  onBulkRoleChange,
  onBulkSpaceAssign,
  onBulkAccess,
  onBulkRemove,
}: MemberBulkActionBarProps) {
  const { t } = useTranslation()
  const count = selectedIds.size
  const ids = Array.from(selectedIds)

  if (count === 0) return null

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
        "flex items-center gap-2 px-4 py-2.5 rounded-xl",
        "bg-card/80 backdrop-blur-xl border border-border/60 shadow-xl",
        "animate-in slide-in-from-bottom-4 fade-in-0 duration-200",
      )}
      style={{ animationTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)" }}
    >
      <span className="text-sm font-semibold text-foreground whitespace-nowrap pr-1">
        {t("members.bulk.selected", { count })}
      </span>

      <div className="w-px h-5 bg-border/60 mx-1" />

      {/* Role */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium rounded-lg">
            {t("members.bulk.role")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="w-[160px]">
          <DropdownMenuItem onClick={() => onBulkRoleChange(ids, "ADMIN")}>{t("members.roles.admin")}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onBulkRoleChange(ids, "EMPLOYEE")}>{t("members.roles.employee")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Space */}
      {locations.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium rounded-lg">
              {t("members.bulk.space")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="w-[180px]">
            {locations.map((loc) => (
              <DropdownMenuItem
                key={loc.id}
                onClick={() => onBulkSpaceAssign(ids, loc.id)}
              >
                <MapPin className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                {loc.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Access — full Access Builder applied to all selected members */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2.5 text-xs font-medium rounded-lg"
        onClick={() => onBulkAccess(ids)}
      >
        <ShieldCheck className="size-3.5 mr-1 text-muted-foreground" />
        {t("members.bulk.access", "Access")}
      </Button>

      <div className="w-px h-5 bg-border/60 mx-1" />

      {/* Delete */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2.5 text-xs font-medium rounded-lg text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10"
        onClick={() => {
          if (window.confirm(t("members.bulk.removeConfirm", { count }))) {
            onBulkRemove(ids)
          }
        }}
      >
        <Trash2 className="size-3.5 mr-1" />
        {t("members.actions.remove")}
      </Button>

      {/* Clear */}
      <Button
        variant="ghost"
        size="icon"
        className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
        onClick={onClear}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  )
})

// ---------------------------------------------------------------------------
// MemberRow component
// ---------------------------------------------------------------------------

interface MemberRowProps {
  member: OrgMember
  isSelf: boolean
  isAdmin: boolean
  index: number
  spaceNames: string[]
  isSelected: boolean
  anySelected: boolean
  onSelect: (id: string, checked: boolean) => void
  onEdit: (member: OrgMember) => void
  onRemove: (member: OrgMember) => void
  onTransfer: (member: OrgMember) => void
  /** The viewer owns this organization — the only person who may hand it over. */
  canTransferOwnership: boolean
  onNavigate: (id: string) => void
}

// Shared grid template \u2014 keeps the header and desktop rows perfectly aligned.
const TABLE_GRID =
  "grid grid-cols-[28px_44px_minmax(0,1.5fr)_minmax(0,1fr)_110px_110px_minmax(0,1.3fr)_40px] items-center gap-4 px-5"

// \u2500\u2500 Row sub-pieces (reused by the desktop table row AND the mobile card) \u2500\u2500\u2500\u2500\u2500\u2500

/**
 * The person who owns the organization.
 *
 * Separate from the role badge because it is a different fact: role says what
 * somebody can do, ownership says whose organization it is. An owner is always
 * an admin, so folding it into the role badge would hide one behind the other.
 */
function OwnerBadge() {
  const { t } = useTranslation()
  return (
    <Badge variant="outline" className="text-xs font-medium border gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400">
      <Crown className="h-3 w-3" />
      {t("members.owner.label", "Owner")}
    </Badge>
  )
}

function RoleBadge({ member }: { member: OrgMember }) {
  const { t } = useTranslation()
  // Admin (system tier) always shows as Admin, even if it also carries a role row.
  if (member.role !== "ADMIN") {
    const named = member.memberRole
    if (named) {
      return (
        <Badge
          variant="outline"
          className="text-xs font-medium border gap-1.5"
          style={{ borderColor: named.color || undefined, color: named.color || undefined }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: named.color || ROLE_COLOR_FALLBACK }} />
          {named.name}
        </Badge>
      )
    }
  }
  const conf = roleBadge(member.role)
  return <Badge variant="outline" className={cn("text-xs font-medium border", conf.className)}>{t(conf.labelKey)}</Badge>
}

function ScheduleBadge({ member }: { member: OrgMember }) {
  const { t } = useTranslation()
  const fixed = member.scheduleType === "FIXED"
  const flexible = member.scheduleType === "FLEXIBLE"
  if (!fixed && !flexible) return <span className="text-sm text-muted-foreground/40">{"\u2014"}</span>
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium border gap-1",
        fixed
          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-800/50"
          : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/50",
      )}
    >
      {fixed ? <Clock className="h-3 w-3" /> : <Timer className="h-3 w-3" />}
      {fixed ? t("members.schedule.fixed") : t("members.schedule.flexible")}
    </Badge>
  )
}

function SpacesCell({ spaceNames }: { spaceNames: string[] }) {
  const { t } = useTranslation()
  if (spaceNames.length === 0) return <span className="text-sm text-muted-foreground/50 italic">{t("members.noSpaces")}</span>
  return (
    <Link
      href="/locations"
      className="inline-flex items-center gap-1.5 min-w-0 text-muted-foreground hover:text-primary transition-colors"
    >
      <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="text-sm truncate">{spaceNames.join(", ")}</span>
    </Link>
  )
}

function RowActions({
  show,
  isSelf,
  member,
  onEdit,
  onRemove,
  onTransfer,
  canTransferOwnership,
  alwaysVisible,
}: {
  show: boolean
  isSelf?: boolean
  member: OrgMember
  onEdit: (m: OrgMember) => void
  onRemove: (m: OrgMember) => void
  onTransfer: (m: OrgMember) => void
  /** The viewer owns this organization — the only person who may hand it over. */
  canTransferOwnership: boolean
  alwaysVisible?: boolean
}) {
  const { t } = useTranslation()
  if (!show) return <div className="w-8" />
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8 transition-opacity", !alwaysVisible && "opacity-0 group-hover:opacity-100")}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => onEdit(member)}>
          <Pencil className="h-4 w-4 mr-2" />
          {t("common.edit")}
        </DropdownMenuItem>
        {/* You can edit your own profile, but you can't remove yourself. */}
        {!isSelf && (
          <>
            <DropdownMenuSeparator />
            {/*
              Handing the organization over. Shown only to the owner, and only on
              somebody else's row: it is the one action in the product that no
              permission grants, because an admin who could take ownership could
              then remove the founder.
            */}
            {canTransferOwnership && !member.isOwner && (
              <DropdownMenuItem onClick={() => onTransfer(member)}>
                <Crown className="h-4 w-4 mr-2" />
                {t("members.owner.transfer", "Transfer ownership")}
              </DropdownMenuItem>
            )}
            {/*
              The owner cannot be removed — the server refuses until ownership
              moves. Saying so here beats offering the action and reporting the
              refusal afterwards, which is how somebody concludes it is broken.
            */}
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              disabled={member.isOwner === true}
              title={member.isOwner ? t("members.owner.cantRemove", "Transfer ownership before removing the owner") : undefined}
              onClick={() => onRemove(member)}
            >
              <UserMinus className="h-4 w-4 mr-2" />
              {t("members.actions.remove")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const MemberRow = memo(function MemberRow({
  member,
  isSelf,
  isAdmin,
  index,
  spaceNames,
  isSelected,
  anySelected,
  onSelect,
  onEdit,
  onRemove,
  onTransfer,
  canTransferOwnership,
  onNavigate,
}: MemberRowProps) {
  const { t } = useTranslation()
  const canManage = isAdmin && !isSelf
  const hasSchedule = member.scheduleType === "FIXED" || member.scheduleType === "FLEXIBLE"

  const nameButton = (
    <button
      type="button"
      className="font-medium text-foreground truncate hover:underline text-left"
      onClick={() => onNavigate(member.id)}
    >
      {member.firstName} {member.lastName}
    </button>
  )

  return (
    <div
      className={cn(
        "group border-b border-border/50 last:border-0 transition-colors hover:bg-accent/30",
        isSelected && "bg-accent/30",
      )}
      style={{ animation: `fadeSlideIn 0.25s ease-out ${index * 40}ms both` }}
    >
      {/* \u2500\u2500 Desktop: aligned table row \u2500\u2500 */}
      <div className={cn(TABLE_GRID, "hidden md:grid py-3.5")}>
        <div className={cn("transition-opacity", anySelected || isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
          {canManage ? (
            <Checkbox checked={isSelected} onCheckedChange={(c) => onSelect(member.id, !!c)} className="h-4 w-4" />
          ) : (
            <div className="h-4 w-4" />
          )}
        </div>
        <UserAvatar firstName={member.firstName} lastName={member.lastName} avatarUrl={member.avatarUrl} seed={member.id} size="md" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {nameButton}
            {isSelf && <span className="text-[11px] text-muted-foreground/70 font-medium">{t("members.you")}</span>}
          </div>
          <p className="text-sm text-muted-foreground truncate">{member.email}</p>
        </div>
        <span className={cn("text-sm truncate", member.position ? "text-foreground" : "text-muted-foreground/40")}>
          {member.position || "\u2014"}
        </span>
        <div className="flex items-center gap-1.5">
          <RoleBadge member={member} />
          {member.isOwner && <OwnerBadge />}
        </div>
        <div><ScheduleBadge member={member} /></div>
        <div className="min-w-0"><SpacesCell spaceNames={spaceNames} /></div>
        <RowActions show={isAdmin} isSelf={isSelf} member={member} onEdit={onEdit} onRemove={onRemove} onTransfer={onTransfer} canTransferOwnership={canTransferOwnership} />
      </div>

      {/* \u2500\u2500 Mobile: stacked card \u2500\u2500 */}
      <div className="md:hidden flex items-start gap-3 px-4 py-3.5">
        {canManage && (
          <Checkbox checked={isSelected} onCheckedChange={(c) => onSelect(member.id, !!c)} className="h-4 w-4 mt-1" />
        )}
        <UserAvatar firstName={member.firstName} lastName={member.lastName} avatarUrl={member.avatarUrl} seed={member.id} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {nameButton}
            {isSelf && <span className="text-[11px] text-muted-foreground/70 font-medium">{t("members.you")}</span>}
          </div>
          <p className="text-sm text-muted-foreground truncate">{member.email}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2">
            <RoleBadge member={member} />
            {member.isOwner && <OwnerBadge />}
            {member.position && <span className="text-xs text-muted-foreground">{member.position}</span>}
            {hasSchedule && <ScheduleBadge member={member} />}
            {spaceNames.length > 0 && <SpacesCell spaceNames={spaceNames} />}
          </div>
        </div>
        <RowActions show={isAdmin} isSelf={isSelf} member={member} onEdit={onEdit} onRemove={onRemove} onTransfer={onTransfer} canTransferOwnership={canTransferOwnership} alwaysVisible />
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function MembersPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const router = useRouter()
  const { user, refreshUser } = useAuth()
  const isAdmin = user?.role === "ADMIN"

  const [search, setSearch] = useState("")
  // Debounced value drives the query so typing doesn't mint a request per keystroke (P7).
  const [debouncedSearch, setDebouncedSearch] = useState("")
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])
  const [roleFilter, setRoleFilter] = useState("all")

  /*
    The org's own roles, for the filter beside the list.

    The Role column shows a member's ASSIGNED ROLE where they have one and falls
    back to the account type otherwise, but the filter offered only the two
    account types — hardcoded — so a role an organization created was visible in
    every row and selectable in none.

    Same query key as the Roles dialog, so opening that dialog after filtering
    costs nothing.
  */
  const { data: orgRoles = [] } = useQuery<AccessRole[]>({
    queryKey: ["orgAccessRoles"],
    queryFn: () => organizationsApi.getRoles("org"),
    staleTime: 5 * 60 * 1000,
  })
  const [page, setPage] = useState(1)

  // Dialogs
  const [editTarget, setEditTarget] = useState<OrgMember | null>(null)
  const [removeTarget, setRemoveTarget] = useState<OrgMember | null>(null)
  const [transferTarget, setTransferTarget] = useState<OrgMember | null>(null)
  const [bulkAccessIds, setBulkAccessIds] = useState<string[] | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [rolesOpen, setRolesOpen] = useState(false)

  // Pending invitations
  const [showPending, setShowPending] = useState(true)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Selection is per visible page — reset it when the page/search/filter changes
  // so a bulk action can never apply to members you can't see (D4).
  useEffect(() => {
    setSelectedIds(new Set())
  }, [debouncedSearch, roleFilter, page])

  // ── Queries ──────────────────────────────────────────────────────────

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["orgMembers", debouncedSearch, roleFilter, page],
    queryFn: () =>
      organizationsApi.getMembers({
        search: debouncedSearch || undefined,
        role: roleFilter,
        page,
        limit: 20,
      }),
  })

  const { data: locationsData } = useQuery({
    queryKey: ["locations-all"],
    queryFn: () => locationsApi.list({ limit: 100 }),
    staleTime: 60000,
  })

  // Fetch all assignments to build member->spaces map
  const locations = locationsData?.data || []

  // Stable key = sorted location ids, so adding+removing a space (same count)
  // still busts the cache (was keyed on locations.length — fragile) (D3).
  const locationIds = useMemo(() => locations.map((l) => l.id).sort(), [locations])
  const locNameById = useMemo(
    () => Object.fromEntries(locations.map((l) => [l.id, l.name])) as Record<string, string>,
    [locations],
  )

  const { data: allAssignments } = useQuery({
    // ONE batched request for every space's roster (was an N+1 fan-out) (P2).
    queryKey: ["all-location-assignments", locationIds.join(",")],
    queryFn: () => locationsApi.getRosters(locationIds),
    enabled: locationIds.length > 0,
    staleTime: 60000,
  })

  // Build a map: userId -> space names
  const memberSpacesMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    if (!allAssignments) return map
    for (const a of allAssignments) {
      const userId = a.userId || a.user?.id
      if (!userId) continue
      const locationName = a.location?.name || locNameById[a.locationId]
      if (!map[userId]) map[userId] = []
      if (locationName && !map[userId]!.includes(locationName)) {
        map[userId]!.push(locationName)
      }
    }
    return map
  }, [allAssignments, locNameById])

  const { data: pendingInvitationsData } = useQuery({
    queryKey: ["pendingInvitations"],
    queryFn: () => invitationsApi.list({ status: "PENDING", limit: 50 }),
    enabled: isAdmin,
  })

  const pendingInvitations = pendingInvitationsData?.data || []
  const members = data?.data || []
  const meta = data?.meta
  const totalCount = meta?.total ?? 0

  // ── Mutations ────────────────────────────────────────────────────────

  // Optimistic removal (audit M-D4). Removing a member is a definite, reversible-on-
  // error action, so the row leaves immediately instead of sitting unchanged for a
  // full round-trip. onError restores the exact snapshot; onSettled re-reads so the
  // server, not the optimistic guess, has the last word.
  const dropRowOptimistically = useCallback(
    async (listKey: string, id: string) => {
      await queryClient.cancelQueries({ queryKey: [listKey] })
      const snapshot = queryClient.getQueriesData({ queryKey: [listKey] })
      queryClient.setQueriesData({ queryKey: [listKey] }, (old: any) => {
        if (!old?.data) return old
        const data = old.data.filter((row: { id: string }) => row.id !== id)
        // Keep the header count honest while the request is in flight.
        const meta = old.meta ? { ...old.meta, total: Math.max(0, (old.meta.total ?? 0) - 1) } : old.meta
        return { ...old, data, meta }
      })
      return snapshot
    },
    [queryClient],
  )

  const restoreSnapshot = useCallback(
    (snapshot?: [readonly unknown[], unknown][]) => {
      snapshot?.forEach(([key, value]) => queryClient.setQueryData(key, value))
    },
    [queryClient],
  )

  /**
   * Handing the organization to somebody else.
   *
   * No optimistic update: this changes who the VIEWER is as much as who the
   * target is — they stop being the owner — so the session and the list are both
   * refetched from the server rather than guessed at locally.
   */
  const transferMutation = useMutation({
    mutationFn: (memberId: string) => organizationsApi.transferOwnership(memberId),
    onSuccess: async () => {
      setTransferTarget(null)
      notify.success(t("members.owner.transferred", "Ownership transferred"))
      await refreshUser()
      queryClient.invalidateQueries({ queryKey: ["orgMembers"] })
    },
    onError: (error: Error) => notify.error(error.message),
  })

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => organizationsApi.removeMember(memberId),
    onMutate: (memberId: string) => {
      setRemoveTarget(null) // close the dialog now — the action is committed
      return dropRowOptimistically("orgMembers", memberId)
    },
    onSuccess: () => {
      notify.success(t("members.toast.memberRemoved"))
    },
    onError: (error: Error, _memberId, snapshot) => {
      restoreSnapshot(snapshot as any)
      notify.error(error.message || t("members.toast.removeFailed"))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["orgMembers"] })
      queryClient.invalidateQueries({ queryKey: ["orgContacts"] })
    },
  })

  const revokeInviteMutation = useMutation({
    mutationFn: (id: string) => invitationsApi.revoke(id),
    onMutate: (id: string) => dropRowOptimistically("pendingInvitations", id),
    onSuccess: () => {
      notify.success(t("invitations.revokeDialog.revokedSuccessfully"))
    },
    onError: (error: Error, _id, snapshot) => {
      restoreSnapshot(snapshot as any)
      notify.error(error.message || t("members.toast.revokeFailed"))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingInvitations"] })
    },
  })

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleSelectMember = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      const selectableIds = members.filter((m) => m.id !== user?.id).map((m) => m.id)
      setSelectedIds(new Set(selectableIds))
    } else {
      setSelectedIds(new Set())
    }
  }, [members, user?.id])

  const handleBulkRoleChange = useCallback(async (memberIds: string[], role: string) => {
    try {
      // allSettled so one failure doesn't abort the rest, silently leaving the org
      // half-changed with the selection intact (D4). Always invalidate + clear.
      const results = await Promise.allSettled(
        memberIds.map((id) => organizationsApi.updateMember(id, { role }))
      )
      const ok = results.filter((r) => r.status === "fulfilled").length
      const failed = results.length - ok
      queryClient.invalidateQueries({ queryKey: ["orgMembers"] })
      setSelectedIds(new Set())
      if (failed === 0) notify.bulk(ok, t("members.toast.roleUpdated"))
      else notify.error(t("members.toast.bulkPartial", { ok, failed }))
    } catch (error) {
      notify.error(errorMessage(error, t("members.toast.updateRolesFailed")))
    }
  }, [queryClient])

  const handleBulkSpaceAssign = useCallback(async (memberIds: string[], locationId: string) => {
    try {
      const results = await Promise.allSettled(
        memberIds.map((id) => locationsApi.assignMember(locationId, { userId: id }))
      )
      const ok = results.filter((r) => r.status === "fulfilled").length
      const failed = results.length - ok
      queryClient.invalidateQueries({ queryKey: ["all-location-assignments"] })
      setSelectedIds(new Set())
      if (failed === 0) notify.success(t("members.toast.assignedToSpace", { count: ok }))
      else notify.error(t("members.toast.bulkPartial", { ok, failed }))
    } catch (error) {
      notify.error(errorMessage(error, t("members.toast.assignFailed")))
    }
  }, [queryClient])

  const handleBulkRemove = useCallback(async (memberIds: string[]) => {
    try {
      const results = await Promise.allSettled(memberIds.map((id) => organizationsApi.removeMember(id)))
      const ok = results.filter((r) => r.status === "fulfilled").length
      const failed = results.length - ok
      queryClient.invalidateQueries({ queryKey: ["orgMembers"] })
      setSelectedIds(new Set())
      if (failed === 0) notify.success(t("members.toast.removedCount", { count: ok }))
      else notify.error(t("members.toast.bulkPartial", { ok, failed }))
    } catch (error) {
      notify.error(errorMessage(error, t("members.toast.removeMembersFailed")))
    }
  }, [queryClient])

  const handleBulkAccess = useCallback((memberIds: string[]) => {
    setBulkAccessIds(memberIds)
  }, [])

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">
                {t("members.team")} {!isLoading && <span className="text-muted-foreground font-normal text-lg">({totalCount})</span>}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("members.teamSubtitle")}
              </p>
            </div>

            <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative" data-tour="members-search">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("members.searchPlaceholder")}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                className="pl-9 w-56 h-9 bg-card border-border/80 rounded-lg text-sm"
              />
            </div>

            {/* Role filter */}
            <Select
              value={roleFilter}
              onValueChange={(v) => {
                setRoleFilter(v)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[130px] h-9 bg-card border-border/80 rounded-lg text-sm">
                <SelectValue placeholder={t("common.all")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.allRoles")}</SelectItem>
                {/* Account types first: they are what the badge falls back to. */}
                <SelectItem value="ADMIN">{t("members.roles.admin")}</SelectItem>
                <SelectItem value="EMPLOYEE">{t("members.roles.employee")}</SelectItem>
                {/* Then the roles this organization actually has. */}
                {orgRoles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
                {/* And the state the Employee badge hides: no role at all. */}
                <SelectItem value="none">{t("members.roles.none", "No role")}</SelectItem>
              </SelectContent>
            </Select>

            {/* Manage roles */}
            {isAdmin && (
              <Button
                onClick={() => setRolesOpen(true)}
                size="sm"
                variant="outline"
                className="h-9 px-4 rounded-lg font-medium"
              >
                <Shield className="h-4 w-4 mr-1.5" />
                {t("roles.manage", "Roles")}
              </Button>
            )}

            {/* Invite */}
            {isAdmin && (
              <Button
                onClick={() => setInviteOpen(true)}
                size="sm"
                data-tour="members-invite"
                className="h-9 px-4 rounded-lg font-medium"
              >
                <UserPlus className="h-4 w-4 mr-1.5" />
                {t("members.inviteShort")}
              </Button>
            )}
          </div>
          </div>
        </div>

        {/* Member list */}
        <div className="bg-card rounded-xl border border-border/80 overflow-hidden">
          {isLoading ? (
            <div className="animate-in fade-in duration-300">
              {/* Shimmer table header */}
              <div className="flex items-center gap-4 px-5 py-3 bg-muted/30 border-b border-border/40">
                <div className="w-7" />
                <div className="w-10" />
                {["w-32", "w-20", "w-16", "w-20", "w-28", "w-6"].map((w, i) => (
                  <div key={i} className={`relative overflow-hidden rounded bg-muted h-3 ${w} before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent`} />
                ))}
              </div>
              {/* Shimmer rows */}
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-border/20 last:border-0">
                  <div className="w-7" />
                  <div className="relative overflow-hidden rounded-full bg-muted size-9 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent" />
                  <div className="flex-1 space-y-1.5">
                    <div className="relative overflow-hidden rounded bg-muted h-4 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent" style={{ width: `${100 + (i * 23) % 80}px` }} />
                    <div className="relative overflow-hidden rounded bg-muted h-3 w-40 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent" />
                  </div>
                  <div className="relative overflow-hidden rounded-full bg-muted h-5 w-16 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent" />
                  <div className="relative overflow-hidden rounded bg-muted h-4 w-20 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent" />
                  <div className="relative overflow-hidden rounded bg-muted h-4 w-28 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/5 before:to-transparent" />
                </div>
              ))}
            </div>
          ) : isError ? (
            /* Error state (audit M-F1). Without this branch a failed request fell
               through to the empty state, so an admin of a 50-person org was told
               "No members yet — invite your first member". */
            <div className="text-center py-20 px-6">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-5">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1.5">{t("members.error.title")}</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
                {t("members.error.description")}
              </p>
              <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="rounded-lg">
                <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
                {t("members.error.retry")}
              </Button>
            </div>
          ) : members.length > 0 ? (
            <>
              {/* Table header */}
              <div className={cn(TABLE_GRID, "hidden md:grid py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border/60")}>
                <div>
                  {isAdmin && (
                    <Checkbox
                      checked={selectedIds.size > 0 && selectedIds.size === members.filter((m) => m.id !== user?.id).length}
                      onCheckedChange={(checked) => handleSelectAll(!!checked)}
                      className="h-4 w-4"
                    />
                  )}
                </div>
                <div /> {/* Avatar spacer */}
                <div>{t("members.table.member")}</div>
                <div>{t("members.table.title")}</div>
                <div>{t("members.table.role")}</div>
                <div>{t("members.table.schedule")}</div>
                <div>{t("members.table.spaces")}</div>
                <div /> {/* Actions spacer */}
              </div>
              <div className="divide-y divide-border/60">
                {members.map((member, i) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    isSelf={member.id === user?.id}
                    isAdmin={isAdmin}
                    index={i}
                    spaceNames={memberSpacesMap[member.id] || []}
                    isSelected={selectedIds.has(member.id)}
                    anySelected={selectedIds.size > 0}
                    onSelect={handleSelectMember}
                    onEdit={setEditTarget}
                    onRemove={setRemoveTarget}
                    onTransfer={setTransferTarget}
                    canTransferOwnership={!!user?.isOwner}
                    onNavigate={(id) => router.push(`/members/${id}`)}
                  />
                ))}
              </div>

              {/* Pagination */}
              {meta && meta.totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-border/60 bg-muted/30">
                  <p className="text-sm text-muted-foreground">
                    {t("common.page", { page: meta.page, totalPages: meta.totalPages })}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={meta.page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="h-8 rounded-lg text-xs"
                    >
                      {t("common.previous")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={meta.page >= meta.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="h-8 rounded-lg text-xs"
                    >
                      {t("common.next")}
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Empty state */
            <div className="text-center py-20 px-6">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-muted/80 flex items-center justify-center mb-5">
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1.5">{t("members.empty.title")}</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
                {t("members.empty.description")}
              </p>
              {isAdmin && (
                <Button onClick={() => setInviteOpen(true)} className="rounded-lg">
                  <UserPlus className="h-4 w-4 mr-2" />
                  {t("members.inviteMember")}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* ── Pending Invitations ────────────────────────────────────── */}
        {isAdmin && pendingInvitations.length > 0 && (
          <div className="mt-4 bg-card rounded-xl border border-border/80 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowPending((p) => !p)}
              className="flex items-center justify-between w-full px-5 py-3 hover:bg-accent/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {t("members.pendingInvitations.title")}
                </span>
                <Badge variant="secondary" className="text-xs font-normal ml-1">
                  {pendingInvitations.length}
                </Badge>
              </div>
              {showPending ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {showPending && (
              <div className="divide-y divide-border/60 border-t border-border/60">
                {pendingInvitations.map((inv) => {
                  const roleConf = roleBadge(inv.targetRole)
                  const expiresDate = new Date(inv.expiresAt)
                  const isExpired = expiresDate < new Date()
                  return (
                    <div
                      key={inv.id}
                      className="group flex items-center gap-4 px-5 py-3 hover:bg-accent/30 transition-colors"
                    >
                      <div className="h-8 w-8 rounded-full bg-muted/80 flex items-center justify-center flex-shrink-0">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-mono font-medium text-foreground tracking-wide">
                          {inv.code || "******"}
                        </p>
                        {inv.createdBy && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t("members.pendingInvitations.createdBy", { name: `${inv.createdBy.firstName} ${inv.createdBy.lastName}` })}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className={cn("text-xs font-medium border", roleConf.className)}>
                        {t(roleConf.labelKey)}
                      </Badge>
                      <span className={cn(
                        "text-xs whitespace-nowrap",
                        isExpired ? "text-red-500" : "text-muted-foreground"
                      )}>
                        {isExpired
                          ? t("members.pendingInvitations.expired")
                          : t("members.pendingInvitations.expires", { date: expiresDate.toLocaleDateString(dateLocale(), { month: "short", day: "numeric" }) })
                        }
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => revokeInviteMutation.mutate(inv.id)}
                        disabled={revokeInviteMutation.isPending}
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-600"
                        title={t("members.pendingInvitations.revoke")}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Edit Member Dialog (shared component) ───────────────────────── */}
      <EditMemberDialog
        member={editTarget}
        isSelf={!!editTarget && editTarget.id === user?.id}
        onClose={() => setEditTarget(null)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["orgMembers"] })}
      />

      {/* ── Invite Dialog (shared component) ─────────────────────────── */}
      <CreateInvitationDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <ManageRolesDialog open={rolesOpen} onOpenChange={setRolesOpen} />

      {/* ── Transfer Ownership Confirmation ────────────────────────────
          Irreversible without the new owner's cooperation: once it lands, only
          THEY can transfer it back. So the dialog states plainly what changes
          and what does not — you keep admin, you stop being the owner. */}
      <AlertDialog
        open={!!transferTarget}
        onOpenChange={(open) => !open && setTransferTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("members.owner.transfer", "Transfer ownership")}</AlertDialogTitle>
            <AlertDialogDescription>
              {transferTarget &&
                t("members.owner.transferDesc", "{{name}} becomes the owner and an admin. You stay an admin.", {
                  name: `${transferTarget.firstName} ${transferTarget.lastName}`,
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg"
              onClick={() => transferTarget && transferMutation.mutate(transferTarget.id)}
              disabled={transferMutation.isPending}
            >
              {t("members.owner.transferConfirm", "Transfer")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Remove Confirmation ────────────────────────────────────────── */}
      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("members.removeTeamMember.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget &&
                t("members.removeTeamMember.description", { name: `${removeTarget.firstName} ${removeTarget.lastName}` })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 rounded-lg"
              onClick={() => removeTarget && removeMutation.mutate(removeTarget.id)}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? t("common.removing") : t("members.actions.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Bulk Action Bar ───────────────────────────────────────────── */}
      {isAdmin && (
        <MemberBulkActionBar
          selectedIds={selectedIds}
          locations={locations}
          onClear={() => setSelectedIds(new Set())}
          onBulkRoleChange={handleBulkRoleChange}
          onBulkSpaceAssign={handleBulkSpaceAssign}
          onBulkAccess={handleBulkAccess}
          onBulkRemove={handleBulkRemove}
        />
      )}

      {/* ── Bulk Access Dialog — full Access Builder applied to all selected ── */}
      <Dialog open={!!bulkAccessIds} onOpenChange={(open) => !open && setBulkAccessIds(null)}>
        <DialogContent className="p-0 gap-0 max-h-[88vh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>{t("members.bulk.accessTitle", "Bulk access")}</DialogTitle>
            <DialogDescription>{t("members.bulk.accessDesc", "Apply access to the selected members")}</DialogDescription>
          </DialogHeader>
          {bulkAccessIds && bulkAccessIds.length > 0 && (() => {
            const template = members.find((m) => m.id === bulkAccessIds[0]) || members.find((m) => bulkAccessIds.includes(m.id))
            if (!template) return null
            return (
              <AccessBuilder
                member={template}
                applyToIds={bulkAccessIds}
                bulkCount={bulkAccessIds.length}
                onSaved={() => {
                  queryClient.invalidateQueries({ queryKey: ["orgMembers"] })
                  setBulkAccessIds(null)
                  setSelectedIds(new Set())
                }}
              />
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
