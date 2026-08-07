"use client"

import { useState, useCallback, useMemo, memo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Search,
  MoreHorizontal,
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
import { useTranslation } from "react-i18next"

import { UserAvatar } from "@/components/user-avatar"
import { useAuth } from "@/contexts/auth-context"
import { CreateInvitationDialog } from "@/components/invitations/create-invitation-dialog"
import { ManageRolesDialog } from "@/components/roles/manage-roles-dialog"
import { EditMemberDialog } from "./_components/edit-member-dialog"
import { AccessBuilder } from "@/components/access-builder"
import { cn } from "@/lib/utils"
import {
  organizationsApi,
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_CONFIG: Record<string, { className: string; gradient: string }> = {
  ADMIN: {
    className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-800/50",
    gradient: "from-blue-500 to-blue-600",
  },
  EMPLOYEE: {
    className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/50",
    gradient: "from-emerald-500 to-emerald-600",
  },
}

// Role label translation keys (labels live in i18n, colors in ROLE_CONFIG).
const ROLE_LABEL_KEY: Record<string, string> = {
  ADMIN: "members.roles.admin",
  EMPLOYEE: "members.roles.employee",
}
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
  onNavigate: (id: string) => void
}

// Shared grid template \u2014 keeps the header and desktop rows perfectly aligned.
const TABLE_GRID =
  "grid grid-cols-[28px_44px_minmax(0,1.5fr)_minmax(0,1fr)_110px_110px_minmax(0,1.3fr)_40px] items-center gap-4 px-5"

// \u2500\u2500 Row sub-pieces (reused by the desktop table row AND the mobile card) \u2500\u2500\u2500\u2500\u2500\u2500

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
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: named.color || "#6b7280" }} />
          {named.name}
        </Badge>
      )
    }
  }
  const conf = ROLE_CONFIG[member.role] || ROLE_CONFIG.EMPLOYEE!
  return <Badge variant="outline" className={cn("text-xs font-medium border", conf.className)}>{t(ROLE_LABEL_KEY[member.role] || "members.roles.employee")}</Badge>
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
  alwaysVisible,
}: {
  show: boolean
  isSelf?: boolean
  member: OrgMember
  onEdit: (m: OrgMember) => void
  onRemove: (m: OrgMember) => void
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
            <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => onRemove(member)}>
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
        <div><RoleBadge member={member} /></div>
        <div><ScheduleBadge member={member} /></div>
        <div className="min-w-0"><SpacesCell spaceNames={spaceNames} /></div>
        <RowActions show={isAdmin} isSelf={isSelf} member={member} onEdit={onEdit} onRemove={onRemove} />
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
            {member.position && <span className="text-xs text-muted-foreground">{member.position}</span>}
            {hasSchedule && <ScheduleBadge member={member} />}
            {spaceNames.length > 0 && <SpacesCell spaceNames={spaceNames} />}
          </div>
        </div>
        <RowActions show={isAdmin} isSelf={isSelf} member={member} onEdit={onEdit} onRemove={onRemove} alwaysVisible />
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
  const { user } = useAuth()
  const isAdmin = user?.role === "ADMIN"

  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [page, setPage] = useState(1)

  // Dialogs
  const [editTarget, setEditTarget] = useState<OrgMember | null>(null)
  const [removeTarget, setRemoveTarget] = useState<OrgMember | null>(null)
  const [bulkAccessIds, setBulkAccessIds] = useState<string[] | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [rolesOpen, setRolesOpen] = useState(false)

  // Pending invitations
  const [showPending, setShowPending] = useState(true)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // ── Queries ──────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery({
    queryKey: ["orgMembers", search, roleFilter, page],
    queryFn: () =>
      organizationsApi.getMembers({
        search: search || undefined,
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

  // Fetch all assignments per location to build member->spaces map
  const locations = locationsData?.data || []

  const { data: allAssignments } = useQuery({
    queryKey: ["all-location-assignments", locations.length],
    queryFn: async () => {
      // Fetch all location assignments in parallel (not sequentially)
      const results = await Promise.allSettled(
        locations.map(async (loc) => {
          const assignments = await locationsApi.getAssignedMembers(loc.id)
          return assignments.map((a) => ({ ...a, locationName: loc.name }))
        })
      )
      return results
        .filter((r): r is PromiseFulfilledResult<any[]> => r.status === "fulfilled")
        .flatMap(r => r.value)
    },
    enabled: locations.length > 0,
    staleTime: 60000,
  })

  // Build a map: userId -> space names
  const memberSpacesMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    if (!allAssignments) return map
    for (const a of allAssignments) {
      const userId = a.userId || a.user?.id
      if (!userId) continue
      if (!map[userId]) map[userId] = []
      if (a.locationName && !map[userId]!.includes(a.locationName)) {
        map[userId]!.push(a.locationName)
      }
    }
    return map
  }, [allAssignments])

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

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => organizationsApi.removeMember(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orgMembers"] })
      setRemoveTarget(null)
      notify.success(t("members.toast.memberRemoved"))
    },
    onError: (error: Error) => {
      notify.error(error.message || t("members.toast.removeFailed"))
    },
  })

  const revokeInviteMutation = useMutation({
    mutationFn: (id: string) => invitationsApi.revoke(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingInvitations"] })
      notify.success(t("invitations.revokeDialog.revokedSuccessfully"))
    },
    onError: (error: Error) => {
      notify.error(error.message || t("members.toast.revokeFailed"))
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
      await Promise.all(
        memberIds.map((id) => organizationsApi.updateMember(id, { role }))
      )
      queryClient.invalidateQueries({ queryKey: ["orgMembers"] })
      setSelectedIds(new Set())
      notify.bulk(memberIds.length, t("members.toast.roleUpdated"))
    } catch (error: any) {
      notify.error(error.message || t("members.toast.updateRolesFailed"))
    }
  }, [queryClient])

  const handleBulkSpaceAssign = useCallback(async (memberIds: string[], locationId: string) => {
    try {
      await Promise.all(
        memberIds.map((id) => locationsApi.assignMember(locationId, { userId: id }))
      )
      queryClient.invalidateQueries({ queryKey: ["all-location-assignments"] })
      setSelectedIds(new Set())
      notify.success(t("members.toast.assignedToSpace", { count: memberIds.length }))
    } catch (error: any) {
      notify.error(error.message || t("members.toast.assignFailed"))
    }
  }, [queryClient])

  const handleBulkRemove = useCallback(async (memberIds: string[]) => {
    try {
      await Promise.all(memberIds.map((id) => organizationsApi.removeMember(id)))
      queryClient.invalidateQueries({ queryKey: ["orgMembers"] })
      setSelectedIds(new Set())
      notify.success(t("members.toast.removedCount", { count: memberIds.length }))
    } catch (error: any) {
      notify.error(error.message || t("members.toast.removeMembersFailed"))
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
                <SelectItem value="ADMIN">{t("members.roles.admin")}</SelectItem>
                <SelectItem value="EMPLOYEE">{t("members.roles.employee")}</SelectItem>
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
                  const roleConf = ROLE_CONFIG[inv.targetRole] || ROLE_CONFIG.EMPLOYEE!
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
                        {t(ROLE_LABEL_KEY[inv.targetRole] || "members.roles.employee")}
                      </Badge>
                      <span className={cn(
                        "text-xs whitespace-nowrap",
                        isExpired ? "text-red-500" : "text-muted-foreground"
                      )}>
                        {isExpired
                          ? t("members.pendingInvitations.expired")
                          : t("members.pendingInvitations.expires", { date: expiresDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) })
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
        <DialogContent className="max-w-2xl p-0 gap-0 max-h-[88vh] overflow-y-auto">
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
