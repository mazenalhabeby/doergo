"use client"

import { useState, useCallback, useMemo, useEffect, memo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Search,
  MoreHorizontal,
  Pencil,
  UserMinus,
  UserPlus,
  Copy,
  Check,
  KeyRound,
  AlertTriangle,
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
  ChevronsUpDown,
} from "lucide-react"
import { notify } from "@/lib/toast"

import { UserAvatar } from "@/components/user-avatar"
import { useAuth } from "@/contexts/auth-context"
import { CreateInvitationDialog } from "@/components/invitations/create-invitation-dialog"
import { cn } from "@/lib/utils"
import {
  organizationsApi,
  invitationsApi,
  locationsApi,
  rolesApi,
  employeesApi,
  type OrgMember,
  type UpdateMemberInput,
  type OrgRoleData,
  type ScheduleEntryInput,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_CONFIG: Record<string, { label: string; className: string; gradient: string }> = {
  ADMIN: {
    label: "Admin",
    className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-800/50",
    gradient: "from-blue-500 to-blue-600",
  },
  MANAGER: {
    label: "Manager",
    className: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-200/50 dark:border-purple-800/50",
    gradient: "from-purple-500 to-purple-600",
  },
  EMPLOYEE: {
    label: "Employee",
    className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/50",
    gradient: "from-emerald-500 to-emerald-600",
  },
}

const DEFAULT_ROLE_PERMISSIONS: Record<
  string,
  { canCreateTasks: boolean; taskCreationScope: string; canViewAllTasks: boolean; canAssignTasks: boolean; canManageUsers: boolean }
> = {
  ADMIN: { canCreateTasks: true, taskCreationScope: "ORG", canViewAllTasks: true, canAssignTasks: true, canManageUsers: true },
  MANAGER: { canCreateTasks: false, taskCreationScope: "SPACE", canViewAllTasks: true, canAssignTasks: true, canManageUsers: false },
  EMPLOYEE: { canCreateTasks: false, taskCreationScope: "SELF", canViewAllTasks: false, canAssignTasks: false, canManageUsers: false },
}

const POSITION_SUGGESTIONS = [
  "Technician", "Driver", "Accountant", "HR Manager", "Sales Representative",
  "Office Manager", "Warehouse Worker", "Service Engineer", "Project Manager",
  "Designer", "Developer", "Customer Support", "Delivery Driver", "Inspector",
]

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

interface EditableScheduleRow {
  dayOfWeek: number
  startTime: string
  endTime: string
  isActive: boolean
}

function createDefaultSchedule(): EditableScheduleRow[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    startTime: "09:00",
    endTime: "17:00",
    isActive: i >= 1 && i <= 5,
  }))
}

// ---------------------------------------------------------------------------
// Position Combobox component
// ---------------------------------------------------------------------------

const PositionCombobox = memo(function PositionCombobox({
  value,
  onChange,
  usedPositions,
}: {
  value: string
  onChange: (value: string) => void
  usedPositions: string[]
}) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState(value)

  // Suggestions that are not already used in the org
  const unusedSuggestions = POSITION_SUGGESTIONS.filter(
    (s) => !usedPositions.some((u) => u.toLowerCase() === s.toLowerCase())
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-9 font-normal text-sm"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || "Select or type a title..."}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={true}>
          <div className="p-2 pb-1">
            <CommandInput
              placeholder="Search or type custom..."
              value={inputValue}
              onValueChange={(v) => {
                setInputValue(v)
                onChange(v)
              }}
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto overflow-x-hidden overscroll-contain" onWheel={(e) => e.stopPropagation()}>
          <CommandList className="max-h-none overflow-visible">
            <CommandEmpty>
              <button
                type="button"
                className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded-sm"
                onClick={() => {
                  onChange(inputValue)
                  setOpen(false)
                }}
              >
                Use &quot;{inputValue}&quot;
              </button>
            </CommandEmpty>
            {usedPositions.length > 0 && (
              <CommandGroup heading="Used in your org">
                {usedPositions.map((pos) => (
                  <CommandItem
                    key={`used-${pos}`}
                    value={pos}
                    onSelect={() => {
                      onChange(pos)
                      setInputValue(pos)
                      setOpen(false)
                    }}
                  >
                    <Check className={cn("mr-2 h-3.5 w-3.5", value === pos ? "opacity-100" : "opacity-0")} />
                    {pos}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {unusedSuggestions.length > 0 && (
              <>
                {usedPositions.length > 0 && <CommandSeparator />}
                <CommandGroup heading="Suggestions">
                  {unusedSuggestions.map((pos) => (
                    <CommandItem
                      key={`sug-${pos}`}
                      value={pos}
                      onSelect={() => {
                        onChange(pos)
                        setInputValue(pos)
                        setOpen(false)
                      }}
                    >
                      <Check className={cn("mr-2 h-3.5 w-3.5", value === pos ? "opacity-100" : "opacity-0")} />
                      {pos}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )
})

// ---------------------------------------------------------------------------
// Compact Schedule Editor (for dialog)
// ---------------------------------------------------------------------------

const CompactScheduleEditor = memo(function CompactScheduleEditor({
  rows,
  onChange,
}: {
  rows: EditableScheduleRow[]
  onChange: (rows: EditableScheduleRow[]) => void
}) {
  const updateRow = (dayOfWeek: number, field: keyof EditableScheduleRow, value: string | boolean) => {
    onChange(rows.map((row) => (row.dayOfWeek === dayOfWeek ? { ...row, [field]: value } : row)))
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground">Weekly hours</Label>
      <div className="border rounded-lg divide-y divide-border/60 bg-muted/20">
        {rows.map((row) => (
          <div
            key={row.dayOfWeek}
            className={cn(
              "grid grid-cols-[44px_1fr_1fr_36px] items-center gap-2 px-3 py-1.5 transition-opacity",
              !row.isActive && "opacity-40"
            )}
          >
            <span className="text-xs font-medium text-foreground">{DAY_NAMES[row.dayOfWeek]}</span>
            <Input
              type="time"
              value={row.startTime}
              onChange={(e) => updateRow(row.dayOfWeek, "startTime", e.target.value)}
              className="h-7 text-xs px-2"
              disabled={!row.isActive}
            />
            <Input
              type="time"
              value={row.endTime}
              onChange={(e) => updateRow(row.dayOfWeek, "endTime", e.target.value)}
              className="h-7 text-xs px-2"
              disabled={!row.isActive}
            />
            <div className="flex justify-center">
              <Switch
                checked={row.isActive}
                onCheckedChange={(checked) => updateRow(row.dayOfWeek, "isActive", !!checked)}
                className="scale-75"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Bulk Action Bar for members
// ---------------------------------------------------------------------------

interface MemberBulkActionBarProps {
  selectedIds: Set<string>
  locations: { id: string; name: string }[]
  onClear: () => void
  onBulkRoleChange: (memberIds: string[], role: string) => void
  onBulkSpaceAssign: (memberIds: string[], locationId: string) => void
  onBulkRemove: (memberIds: string[]) => void
}

const MemberBulkActionBar = memo(function MemberBulkActionBar({
  selectedIds,
  locations,
  onClear,
  onBulkRoleChange,
  onBulkSpaceAssign,
  onBulkRemove,
}: MemberBulkActionBarProps) {
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
        {count} selected
      </span>

      <div className="w-px h-5 bg-border/60 mx-1" />

      {/* Role */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium rounded-lg">
            Role
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="w-[160px]">
          <DropdownMenuItem onClick={() => onBulkRoleChange(ids, "ADMIN")}>Admin</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onBulkRoleChange(ids, "MANAGER")}>Manager</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onBulkRoleChange(ids, "EMPLOYEE")}>Employee</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Space */}
      {locations.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs font-medium rounded-lg">
              Space
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

      <div className="w-px h-5 bg-border/60 mx-1" />

      {/* Delete */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2.5 text-xs font-medium rounded-lg text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10"
        onClick={() => {
          if (window.confirm(`Remove ${count} member${count !== 1 ? "s" : ""} from the organization?`)) {
            onBulkRemove(ids)
          }
        }}
      >
        <Trash2 className="size-3.5 mr-1" />
        Remove
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
  const roleConfig = member.orgRole
    ? { label: member.orgRole.name, className: "", gradient: "from-gray-500 to-gray-600" }
    : ROLE_CONFIG[member.role] || ROLE_CONFIG.EMPLOYEE!

  const scheduleLabel = member.scheduleType === "FIXED"
    ? "Fixed"
    : member.scheduleType === "FLEXIBLE"
      ? "Flexible"
      : null

  return (
    <div
      className={cn(
        "group grid grid-cols-[28px_40px_1fr_120px_90px_100px_180px_40px] items-center gap-4 px-5 py-4 hover:bg-accent/40 transition-colors",
        isSelected && "bg-accent/30"
      )}
      style={{ animation: `fadeSlideIn 0.25s ease-out ${index * 40}ms both` }}
    >
      {/* Checkbox */}
      <div className={cn("transition-opacity", anySelected || isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
        {isAdmin && !isSelf ? (
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onSelect(member.id, !!checked)}
            className="h-4 w-4"
          />
        ) : (
          <div className="h-4 w-4" />
        )}
      </div>

      {/* Avatar */}
      <UserAvatar firstName={member.firstName} lastName={member.lastName} avatarUrl={member.avatarUrl} seed={member.id} size="lg" />

      {/* Name + email */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="font-medium text-foreground truncate hover:underline text-left"
            onClick={() => onNavigate(member.id)}
          >
            {member.firstName} {member.lastName}
          </button>
          {isSelf && (
            <span className="text-[11px] text-muted-foreground/70 font-medium">you</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">{member.email}</p>
      </div>

      {/* Title/Position */}
      <div className="hidden md:block min-w-0">
        <span className={cn("text-sm truncate", member.position ? "text-foreground" : "text-muted-foreground/50")}>
          {member.position || "\u2014"}
        </span>
      </div>

      {/* Role badge */}
      {member.orgRole ? (
        <Badge
          variant="outline"
          className="text-xs font-medium border gap-1"
          style={{ borderColor: member.orgRole.color || undefined, color: member.orgRole.color || undefined }}
        >
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: member.orgRole.color || "#6b7280" }}
          />
          {member.orgRole.name}
        </Badge>
      ) : (
        <Badge variant="outline" className={cn("text-xs font-medium border", roleConfig.className)}>
          {roleConfig.label}
        </Badge>
      )}

      {/* Schedule badge */}
      <div className="hidden md:block">
        {scheduleLabel ? (
          <Badge
            variant="outline"
            className={cn(
              "text-xs font-medium border gap-1",
              member.scheduleType === "FIXED"
                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-800/50"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/50"
            )}
          >
            {member.scheduleType === "FIXED" ? (
              <Clock className="h-3 w-3" />
            ) : (
              <Timer className="h-3 w-3" />
            )}
            {scheduleLabel}
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground/50">{"\u2014"}</span>
        )}
      </div>

      {/* Spaces */}
      <div className="hidden md:flex items-center gap-1.5 min-w-0">
        {spaceNames.length > 0 ? (
          <Link href="/locations" className="flex items-center gap-1.5 min-w-0 hover:text-primary transition-colors">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-sm text-muted-foreground truncate hover:text-primary">
              {spaceNames.join(", ")}
            </span>
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground/50 italic">No spaces</span>
        )}
      </div>

      {/* Actions */}
      {isAdmin && !isSelf ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => onEdit(member)}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              onClick={() => onRemove(member)}
            >
              <UserMinus className="h-4 w-4 mr-2" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div className="w-8" />
      )}
    </div>
  )
})

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function MembersPage() {
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
  const [inviteOpen, setInviteOpen] = useState(false)

  // Edit form state
  const [editFirstName, setEditFirstName] = useState("")
  const [editLastName, setEditLastName] = useState("")
  const [editPosition, setEditPosition] = useState("")
  const [editScheduleType, setEditScheduleType] = useState("NONE")
  const [editMonthlyHourBudget, setEditMonthlyHourBudget] = useState<number | "">("")
  const [editScheduleRows, setEditScheduleRows] = useState<EditableScheduleRow[]>(createDefaultSchedule())
  const [editRole, setEditRole] = useState("")
  const [editPerms, setEditPerms] = useState({
    canCreateTasks: false,
    canViewAllTasks: false,
    canAssignTasks: false,
    canManageUsers: false,
  })
  const [editTaskCreationScope, setEditTaskCreationScope] = useState("NONE")

  // Password reset
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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

  // Fetch org roles for dynamic role dropdown
  const { data: orgRoles = [] } = useQuery({
    queryKey: ["roles"],
    queryFn: rolesApi.list,
    enabled: isAdmin,
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

  // Fetch schedule when editing a member with FIXED schedule
  const { data: editScheduleData } = useQuery({
    queryKey: ["employeeSchedule", editTarget?.id],
    queryFn: () => employeesApi.getSchedule(editTarget!.id),
    enabled: !!editTarget && editScheduleType === "FIXED",
  })

  // Populate schedule rows when data loads
  useEffect(() => {
    if (editScheduleData?.schedule && editScheduleData.schedule.length > 0) {
      const rows = createDefaultSchedule()
      for (const entry of editScheduleData.schedule) {
        const row = rows[entry.dayOfWeek]
        if (row) {
          row.startTime = entry.startTime
          row.endTime = entry.endTime
          row.isActive = entry.isActive
        }
      }
      setEditScheduleRows(rows)
    }
  }, [editScheduleData])

  const members = data?.data || []
  const meta = data?.meta
  const totalCount = meta?.total ?? 0

  // Compute used positions across the org for the combobox
  const usedPositions = useMemo(() => {
    const positions = new Set<string>()
    for (const m of members) {
      if (m.position) positions.add(m.position)
    }
    return Array.from(positions).sort()
  }, [members])

  // ── Mutations ────────────────────────────────────────────────────────

  const updateMemberMutation = useMutation({
    mutationFn: ({ memberId, data }: { memberId: string; data: UpdateMemberInput }) =>
      organizationsApi.updateMember(memberId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orgMembers"] })
      setEditTarget(null)
      setTempPassword(null)
      notify.success("Member updated")
    },
    onError: (error: Error) => {
      notify.error(error.message || "Failed to update member")
    },
  })

  const resetPasswordMutation = useMutation({
    mutationFn: (memberId: string) => organizationsApi.resetMemberPassword(memberId),
    onSuccess: (data) => {
      if (data?.temporaryPassword) {
        setTempPassword(data.temporaryPassword)
        setCopied(false)
      }
    },
    onError: (error: Error) => {
      notify.error(error.message || "Failed to reset password")
    },
  })

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => organizationsApi.removeMember(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orgMembers"] })
      setRemoveTarget(null)
      notify.success("Member removed")
    },
    onError: (error: Error) => {
      notify.error(error.message || "Failed to remove member")
    },
  })

  const revokeInviteMutation = useMutation({
    mutationFn: (id: string) => invitationsApi.revoke(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pendingInvitations"] })
      notify.success("Invitation revoked")
    },
    onError: (error: Error) => {
      notify.error(error.message || "Failed to revoke invitation")
    },
  })

  const saveScheduleMutation = useMutation({
    mutationFn: ({ memberId, schedule }: { memberId: string; schedule: ScheduleEntryInput[] }) =>
      employeesApi.setSchedule(memberId, schedule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employeeSchedule"] })
    },
    onError: (error: Error) => {
      notify.error(error.message || "Failed to save schedule")
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
      notify.bulk(memberIds.length, "role updated")
    } catch (error: any) {
      notify.error(error.message || "Failed to update roles")
    }
  }, [queryClient])

  const handleBulkSpaceAssign = useCallback(async (memberIds: string[], locationId: string) => {
    try {
      await Promise.all(
        memberIds.map((id) => locationsApi.assignMember(locationId, { userId: id }))
      )
      queryClient.invalidateQueries({ queryKey: ["all-location-assignments"] })
      setSelectedIds(new Set())
      notify.success(`Assigned ${memberIds.length} member${memberIds.length !== 1 ? "s" : ""} to space`)
    } catch (error: any) {
      notify.error(error.message || "Failed to assign to space")
    }
  }, [queryClient])

  const handleBulkRemove = useCallback(async (memberIds: string[]) => {
    try {
      await Promise.all(memberIds.map((id) => organizationsApi.removeMember(id)))
      queryClient.invalidateQueries({ queryKey: ["orgMembers"] })
      setSelectedIds(new Set())
      notify.success(`Removed ${memberIds.length} member${memberIds.length !== 1 ? "s" : ""}`)
    } catch (error: any) {
      notify.error(error.message || "Failed to remove members")
    }
  }, [queryClient])

  const openEditDialog = useCallback((member: OrgMember) => {
    setEditTarget(member)
    setEditFirstName(member.firstName)
    setEditLastName(member.lastName)
    setEditPosition(member.position || "")
    setEditScheduleType(member.scheduleType || "NONE")
    setEditMonthlyHourBudget(member.monthlyHourBudget ?? "")
    setEditRole(member.role)
    setEditPerms({
      canCreateTasks: member.canCreateTasks,
      canViewAllTasks: member.canViewAllTasks,
      canAssignTasks: member.canAssignTasks,
      canManageUsers: member.canManageUsers,
    })
    setEditTaskCreationScope(member.taskCreationScope || "NONE")
    setEditScheduleRows(createDefaultSchedule())
    setTempPassword(null)
    setCopied(false)
  }, [])

  const handleRoleChange = (role: string) => {
    setEditRole(role)
    const defaults = DEFAULT_ROLE_PERMISSIONS[role]
    if (defaults) {
      setEditPerms({
        canCreateTasks: defaults.canCreateTasks,
        canViewAllTasks: defaults.canViewAllTasks,
        canAssignTasks: defaults.canAssignTasks,
        canManageUsers: defaults.canManageUsers,
      })
      setEditTaskCreationScope(defaults.taskCreationScope)
    }
  }

  const handleSave = () => {
    if (!editTarget) return

    // Save schedule if FIXED
    if (editScheduleType === "FIXED") {
      saveScheduleMutation.mutate({
        memberId: editTarget.id,
        schedule: editScheduleRows.map((row) => ({
          dayOfWeek: row.dayOfWeek,
          startTime: row.startTime,
          endTime: row.endTime,
          isActive: row.isActive,
        })),
      })
    }

    updateMemberMutation.mutate({
      memberId: editTarget.id,
      data: {
        firstName: editFirstName,
        lastName: editLastName,
        position: editPosition || undefined,
        scheduleType: editScheduleType,
        monthlyHourBudget: editScheduleType === "FLEXIBLE" && editMonthlyHourBudget !== ""
          ? Number(editMonthlyHourBudget)
          : undefined,
        role: editRole,
      },
    })
  }

  const handleCopyPassword = async () => {
    if (!tempPassword) return
    await navigator.clipboard.writeText(tempPassword)
    setCopied(true)
    notify.copied("password")
    setTimeout(() => setCopied(false), 3000)
  }

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">
                Team {!isLoading && <span className="text-muted-foreground font-normal text-lg">({totalCount})</span>}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage your team members — assign roles, permissions, and spaces.
              </p>
            </div>

            <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search..."
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
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="MANAGER">Manager</SelectItem>
                <SelectItem value="EMPLOYEE">Employee</SelectItem>
              </SelectContent>
            </Select>

            {/* Invite */}
            {isAdmin && (
              <Button
                onClick={() => setInviteOpen(true)}
                size="sm"
                className="h-9 px-4 rounded-lg font-medium"
              >
                <UserPlus className="h-4 w-4 mr-1.5" />
                Invite
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
              <div className="grid grid-cols-[28px_40px_1fr_120px_90px_100px_180px_40px] items-center gap-4 px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border/60">
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
                <div>Member</div>
                <div className="hidden md:block">Title</div>
                <div>Role</div>
                <div className="hidden md:block">Schedule</div>
                <div className="hidden md:block">Spaces</div>
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
                    onEdit={openEditDialog}
                    onRemove={setRemoveTarget}
                    onNavigate={(id) => router.push(`/members/${id}`)}
                  />
                ))}
              </div>

              {/* Pagination */}
              {meta && meta.totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-border/60 bg-muted/30">
                  <p className="text-sm text-muted-foreground">
                    Page {meta.page} of {meta.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={meta.page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="h-8 rounded-lg text-xs"
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={meta.page >= meta.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="h-8 rounded-lg text-xs"
                    >
                      Next
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
              <h3 className="text-lg font-semibold text-foreground mb-1.5">Build your team</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
                Add team members and assign them to spaces. Each member can have different roles and permissions.
              </p>
              {isAdmin && (
                <Button onClick={() => setInviteOpen(true)} className="rounded-lg">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite Member
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
                  Pending Invitations
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
                            by {inv.createdBy.firstName} {inv.createdBy.lastName}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className={cn("text-xs font-medium border", roleConf.className)}>
                        {roleConf.label}
                      </Badge>
                      <span className={cn(
                        "text-xs whitespace-nowrap",
                        isExpired ? "text-red-500" : "text-muted-foreground"
                      )}>
                        {isExpired
                          ? "Expired"
                          : `Expires ${expiresDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                        }
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => revokeInviteMutation.mutate(inv.id)}
                        disabled={revokeInviteMutation.isPending}
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-600"
                        title="Revoke"
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

      {/* ── Edit Member Dialog ─────────────────────────────────────────── */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null)
            setTempPassword(null)
          }
        }}
      >
        <DialogContent className="max-w-lg px-6">
          <DialogHeader>
            <DialogTitle>Edit Member</DialogTitle>
            <DialogDescription>
              {editTarget && `Update settings for ${editTarget.firstName} ${editTarget.lastName}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2 max-h-[65vh] overflow-y-auto overflow-x-hidden px-1">
            {/* Name */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="editFirstName" className="text-xs font-medium text-muted-foreground">First name</Label>
                <Input
                  id="editFirstName"
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  className="h-9 focus-visible:ring-offset-0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="editLastName" className="text-xs font-medium text-muted-foreground">Last name</Label>
                <Input
                  id="editLastName"
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  className="h-9 focus-visible:ring-offset-0"
                />
              </div>
            </div>

            {/* Title / Position */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Title</Label>
              <PositionCombobox
                value={editPosition}
                onChange={setEditPosition}
                usedPositions={usedPositions}
              />
            </div>

            {/* Email (read-only) */}
            {editTarget && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Email</Label>
                <p className="text-sm text-foreground/70 py-1">{editTarget.email}</p>
              </div>
            )}

            <Separator />

            {/* Schedule Type */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Schedule</Label>
              <Select value={editScheduleType} onValueChange={(v) => {
                setEditScheduleType(v)
                if (v === "FIXED") {
                  setEditScheduleRows(createDefaultSchedule())
                }
              }}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No tracking</SelectItem>
                  <SelectItem value="FIXED">Fixed schedule</SelectItem>
                  <SelectItem value="FLEXIBLE">Flexible hours</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Fixed Schedule Editor */}
            {editScheduleType === "FIXED" && (
              <CompactScheduleEditor
                rows={editScheduleRows}
                onChange={setEditScheduleRows}
              />
            )}

            {/* Monthly Hour Budget (FLEXIBLE only) */}
            {editScheduleType === "FLEXIBLE" && (
              <div className="space-y-1.5">
                <Label htmlFor="editBudget" className="text-xs font-medium text-muted-foreground">Monthly hour budget</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="editBudget"
                    type="number"
                    min={0}
                    max={744}
                    value={editMonthlyHourBudget}
                    onChange={(e) => setEditMonthlyHourBudget(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="160"
                    className="h-9 w-28 focus-visible:ring-offset-0"
                  />
                  <span className="text-sm text-muted-foreground">hours/month</span>
                </div>
              </div>
            )}

            {/* Role */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Role</Label>
              {orgRoles.length > 0 ? (
                <Select value={editRole} onValueChange={handleRoleChange}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {orgRoles.map((r) => (
                      <SelectItem key={r.legacyRole || r.slug} value={r.legacyRole || r.slug}>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full inline-block"
                            style={{ backgroundColor: r.color || "#6b7280" }}
                          />
                          {r.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={editRole} onValueChange={handleRoleChange}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                    <SelectItem value="EMPLOYEE">Employee</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Role permissions summary */}
            {editRole && (
              <div className="rounded-lg bg-muted/50 dark:bg-muted/20 border border-border/50 px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground mb-1.5">
                  Permissions are managed by the role. <a href="/settings/roles" className="text-primary hover:underline">Edit roles →</a>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(() => {
                    const role = orgRoles.find((r: any) => (r.legacyRole || r.slug) === editRole)
                    if (!role) return null
                    const perms = (role as any).permissions || {}
                    const activePerms = Object.entries(perms).filter(([k, v]) => v === true && k !== 'taskCreationScope').map(([k]) => k)
                    const labels: Record<string, string> = {
                      canCreateTasks: 'Create tasks', canViewAllTasks: 'View all', canAssignTasks: 'Assign',
                      canDeleteTasks: 'Delete tasks', canEditAnyTask: 'Edit any', canManageUsers: 'Manage team',
                      canInviteUsers: 'Invite', canManageRoles: 'Manage roles', canViewAttendance: 'Attendance',
                      canApproveTimeOff: 'Approve time off', canApproveOvertime: 'Approve overtime',
                      canManageLocations: 'Manage spaces', canManageWorkflows: 'Workflows', canManageOrgSettings: 'Settings',
                    }
                    const scope = perms.taskCreationScope
                    const scopeLabel = scope === 'ORG' ? 'All spaces' : scope === 'SPACE' ? 'Their spaces' : scope === 'SELF' ? 'Self only' : null
                    return (
                      <>
                        {activePerms.map((key) => (
                          <span key={key} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                            {labels[key] || key}
                          </span>
                        ))}
                        {scopeLabel && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                            Create: {scopeLabel}
                          </span>
                        )}
                        {activePerms.length === 0 && !scopeLabel && (
                          <span className="text-[10px] text-muted-foreground/50 italic">No permissions</span>
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>
            )}

            {/* Space assignments - display current ones */}
            {editTarget && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Spaces</Label>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {(() => {
                      const memberAssignments = (allAssignments || []).filter(
                        (a: any) => a.userId === editTarget.id || a.technicianId === editTarget.id
                      )
                      const assignedLocationIds = new Set(memberAssignments.map((a: any) => a.locationId || a.companyLocationId))
                      const assignedLocations = (locations || []).filter((l: any) => assignedLocationIds.has(l.id))
                      const unassignedLocations = (locations || []).filter((l: any) => !assignedLocationIds.has(l.id))

                      return (
                        <>
                          {assignedLocations.length > 0 ? (
                            assignedLocations.map((loc: any) => {
                              const assignment = memberAssignments.find((a: any) => (a.locationId || a.companyLocationId) === loc.id)
                              return (
                                <Badge
                                  key={loc.id}
                                  variant="secondary"
                                  className="text-xs font-normal py-0.5 px-2 pr-1 gap-1 group/chip"
                                >
                                  <MapPin className="h-3 w-3" />
                                  {loc.name}
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!assignment?.id) return
                                      try {
                                        await locationsApi.removeAssignment(loc.id, assignment.id)
                                        queryClient.invalidateQueries({ queryKey: ["allAssignments"] })
                                        notify.success(`Removed from ${loc.name}`)
                                      } catch { notify.error("Failed to remove") }
                                    }}
                                    className="ml-0.5 p-0.5 rounded hover:bg-destructive/20 transition-colors"
                                  >
                                    <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                  </button>
                                </Badge>
                              )
                            })
                          ) : (
                            <span className="text-sm text-muted-foreground/50 italic">No spaces</span>
                          )}
                          {unassignedLocations.length > 0 && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-6 px-2 text-xs rounded-full gap-1">
                                  <Plus className="h-3 w-3" />
                                  Add
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-48">
                                {unassignedLocations.map((loc: any) => (
                                  <DropdownMenuItem
                                    key={loc.id}
                                    onClick={async () => {
                                      try {
                                        await locationsApi.assignMember(loc.id, { userId: editTarget.id })
                                        queryClient.invalidateQueries({ queryKey: ["allAssignments"] })
                                        notify.success(`Assigned to ${loc.name}`)
                                      } catch { notify.error("Failed to assign") }
                                    }}
                                  >
                                    <MapPin className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                                    {loc.name}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </>
                      )
                    })()}
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Password reset */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground">Password</Label>
                {!tempPassword && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => editTarget && resetPasswordMutation.mutate(editTarget.id)}
                    disabled={resetPasswordMutation.isPending}
                    className="h-7 text-xs"
                  >
                    <KeyRound className="h-3 w-3 mr-1.5" />
                    {resetPasswordMutation.isPending ? "Generating..." : "Reset password"}
                  </Button>
                )}
              </div>
              {tempPassword ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Copy this password now. It will not be shown again.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={tempPassword}
                      className="font-mono text-sm h-9"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopyPassword}
                      className="h-9 w-9 flex-shrink-0"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditTarget(null)
                setTempPassword(null)
              }}
              className="rounded-lg"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateMemberMutation.isPending || !editFirstName.trim() || !editLastName.trim()}
              className="rounded-lg"
            >
              {updateMemberMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Invite Dialog (shared component) ─────────────────────────── */}
      <CreateInvitationDialog open={inviteOpen} onOpenChange={setInviteOpen} />

      {/* ── Remove Confirmation ────────────────────────────────────────── */}
      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget &&
                `Are you sure you want to remove ${removeTarget.firstName} ${removeTarget.lastName} from the organization? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 rounded-lg"
              onClick={() => removeTarget && removeMutation.mutate(removeTarget.id)}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? "Removing..." : "Remove"}
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
          onBulkRemove={handleBulkRemove}
        />
      )}
    </div>
  )
}
