"use client"

import { useState, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import {
  Users,
  Search,
  MoreHorizontal,
  Shield,
  UserMinus,
  RefreshCw,
  UserPlus,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { useAuth } from "@/contexts/auth-context"
import {
  organizationsApi,
  type OrgMember,
  type UpdateMemberRoleInput,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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

const ROLE_BADGES: Record<string, { label: string; className: string }> = {
  ADMIN: { label: "Admin", className: "bg-blue-100 text-blue-700" },
  DISPATCHER: { label: "Dispatcher", className: "bg-purple-100 text-purple-700" },
  TECHNICIAN: { label: "Technician", className: "bg-green-100 text-green-700" },
}

const PLATFORM_BADGES: Record<string, { label: string; className: string }> = {
  WEB: { label: "Web", className: "bg-slate-100 text-slate-600" },
  MOBILE: { label: "Mobile", className: "bg-slate-100 text-slate-600" },
  BOTH: { label: "Both", className: "bg-slate-100 text-slate-600" },
}

const DEFAULT_PERMISSIONS: Record<
  string,
  { platform: string; canCreateTasks: boolean; canViewAllTasks: boolean; canAssignTasks: boolean; canManageUsers: boolean }
> = {
  ADMIN: { platform: "BOTH", canCreateTasks: true, canViewAllTasks: true, canAssignTasks: true, canManageUsers: true },
  DISPATCHER: { platform: "WEB", canCreateTasks: false, canViewAllTasks: true, canAssignTasks: true, canManageUsers: false },
  TECHNICIAN: { platform: "MOBILE", canCreateTasks: false, canViewAllTasks: false, canAssignTasks: false, canManageUsers: false },
}

export default function MembersPage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isAdmin = user?.role === "ADMIN"

  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [page, setPage] = useState(1)

  // Edit role dialog
  const [editTarget, setEditTarget] = useState<OrgMember | null>(null)
  const [editRole, setEditRole] = useState("")
  const [editPlatform, setEditPlatform] = useState("")
  const [editPerms, setEditPerms] = useState({
    canCreateTasks: false,
    canViewAllTasks: false,
    canAssignTasks: false,
    canManageUsers: false,
  })

  // Remove dialog
  const [removeTarget, setRemoveTarget] = useState<OrgMember | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["orgMembers", search, roleFilter, page],
    queryFn: () =>
      organizationsApi.getMembers({
        search: search || undefined,
        role: roleFilter,
        page,
        limit: 10,
      }),
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ memberId, data }: { memberId: string; data: UpdateMemberRoleInput }) =>
      organizationsApi.updateMemberRole(memberId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orgMembers"] })
      setEditTarget(null)
      toast.success("Member role updated successfully")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update role")
    },
  })

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => organizationsApi.removeMember(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orgMembers"] })
      setRemoveTarget(null)
      toast.success("Member removed from organization")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to remove member")
    },
  })

  const openEditDialog = useCallback((member: OrgMember) => {
    setEditTarget(member)
    setEditRole(member.role)
    setEditPlatform(member.platform)
    setEditPerms({
      canCreateTasks: member.canCreateTasks,
      canViewAllTasks: member.canViewAllTasks,
      canAssignTasks: member.canAssignTasks,
      canManageUsers: member.canManageUsers,
    })
  }, [])

  const handleRoleChange = (role: string) => {
    setEditRole(role)
    const defaults = DEFAULT_PERMISSIONS[role]
    if (defaults) {
      setEditPlatform(defaults.platform)
      setEditPerms({
        canCreateTasks: defaults.canCreateTasks,
        canViewAllTasks: defaults.canViewAllTasks,
        canAssignTasks: defaults.canAssignTasks,
        canManageUsers: defaults.canManageUsers,
      })
    }
  }

  const handleSaveRole = () => {
    if (!editTarget) return
    updateRoleMutation.mutate({
      memberId: editTarget.id,
      data: {
        role: editRole,
        platform: editPlatform,
        ...editPerms,
      },
    })
  }

  const members = data?.data || []
  const meta = data?.meta

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Organization Members</h1>
          <p className="text-sm text-slate-500">
            {meta ? `${meta.total} member${meta.total !== 1 ? "s" : ""}` : "Loading..."}
          </p>
        </div>
        <Link href="/invitations">
          <Button>
            <UserPlus className="h-4 w-4 mr-2" />
            Invite Member
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={roleFilter}
          onValueChange={(v) => {
            setRoleFilter(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
            <SelectItem value="DISPATCHER">Dispatcher</SelectItem>
            <SelectItem value="TECHNICIAN">Technician</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : members.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                {isAdmin && <TableHead className="w-16"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const roleBadge = ROLE_BADGES[member.role] || ROLE_BADGES.TECHNICIAN!
                const platformBadge = PLATFORM_BADGES[member.platform] || PLATFORM_BADGES.WEB!
                const isSelf = member.id === user?.id
                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-slate-800">
                          {member.firstName} {member.lastName}
                          {isSelf && (
                            <span className="ml-2 text-xs text-slate-400">(you)</span>
                          )}
                        </p>
                        <p className="text-sm text-slate-500">{member.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={roleBadge.className}>
                        {roleBadge.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={platformBadge.className}>
                        {platformBadge.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {member.isActive ? (
                        <Badge className="bg-green-100 text-green-700">Active</Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-500">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {format(new Date(member.createdAt), "MMM d, yyyy")}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        {!isSelf && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditDialog(member)}>
                                <Shield className="h-4 w-4 mr-2" />
                                Edit Role
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => setRemoveTarget(member)}
                              >
                                <UserMinus className="h-4 w-4 mr-2" />
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-12 text-slate-500">
            <Users className="h-12 w-12 mx-auto mb-4 text-slate-300" />
            <p>No members found</p>
          </div>
        )}

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t">
            <p className="text-sm text-slate-500">
              Page {meta.page} of {meta.totalPages} ({meta.total} total)
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={meta.page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Role Dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Member Role</DialogTitle>
            <DialogDescription>
              Update role and permissions for{" "}
              {editTarget && `${editTarget.firstName} ${editTarget.lastName}`}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={handleRoleChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="DISPATCHER">Dispatcher</SelectItem>
                  <SelectItem value="TECHNICIAN">Technician</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Platform</Label>
              <Select value={editPlatform} onValueChange={setEditPlatform}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEB">Web Only</SelectItem>
                  <SelectItem value="MOBILE">Mobile Only</SelectItem>
                  <SelectItem value="BOTH">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Permissions</Label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="canCreateTasks"
                    checked={editPerms.canCreateTasks}
                    onCheckedChange={(checked) =>
                      setEditPerms((p) => ({ ...p, canCreateTasks: !!checked }))
                    }
                  />
                  <label htmlFor="canCreateTasks" className="text-sm">
                    Can create tasks
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="canViewAllTasks"
                    checked={editPerms.canViewAllTasks}
                    onCheckedChange={(checked) =>
                      setEditPerms((p) => ({ ...p, canViewAllTasks: !!checked }))
                    }
                  />
                  <label htmlFor="canViewAllTasks" className="text-sm">
                    Can view all tasks
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="canAssignTasks"
                    checked={editPerms.canAssignTasks}
                    onCheckedChange={(checked) =>
                      setEditPerms((p) => ({ ...p, canAssignTasks: !!checked }))
                    }
                  />
                  <label htmlFor="canAssignTasks" className="text-sm">
                    Can assign tasks
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="canManageUsers"
                    checked={editPerms.canManageUsers}
                    onCheckedChange={(checked) =>
                      setEditPerms((p) => ({ ...p, canManageUsers: !!checked }))
                    }
                  />
                  <label htmlFor="canManageUsers" className="text-sm">
                    Can manage users
                  </label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveRole}
              disabled={updateRoleMutation.isPending}
            >
              {updateRoleMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation */}
      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <strong>
                {removeTarget &&
                  `${removeTarget.firstName} ${removeTarget.lastName}`}
              </strong>{" "}
              from the organization? They will lose access and need to be
              re-invited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() =>
                removeTarget && removeMutation.mutate(removeTarget.id)
              }
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? "Removing..." : "Remove Member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
