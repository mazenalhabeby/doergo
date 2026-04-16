"use client"

import { useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import {
  Users,
  Search,
  MoreHorizontal,
  Pencil,
  UserMinus,
  RefreshCw,
  UserPlus,
  Copy,
  Check,
  KeyRound,
  AlertTriangle,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { useAuth } from "@/contexts/auth-context"
import { cn } from "@/lib/utils"
import {
  organizationsApi,
  type OrgMember,
  type UpdateMemberInput,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
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
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isAdmin = user?.role === "ADMIN"

  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [page, setPage] = useState(1)

  // Edit member dialog
  const [editTarget, setEditTarget] = useState<OrgMember | null>(null)
  const [editFirstName, setEditFirstName] = useState("")
  const [editLastName, setEditLastName] = useState("")
  const [editRole, setEditRole] = useState("")
  const [editPlatform, setEditPlatform] = useState("")
  const [editPerms, setEditPerms] = useState({
    canCreateTasks: false,
    canViewAllTasks: false,
    canAssignTasks: false,
    canManageUsers: false,
  })

  // Password reset state
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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

  const updateMemberMutation = useMutation({
    mutationFn: ({ memberId, data }: { memberId: string; data: UpdateMemberInput }) =>
      organizationsApi.updateMember(memberId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orgMembers"] })
      setEditTarget(null)
      setTempPassword(null)
      toast.success(t("members.editDialog.updatedSuccessfully"))
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update member")
    },
  })

  const resetPasswordMutation = useMutation({
    mutationFn: (memberId: string) =>
      organizationsApi.resetMemberPassword(memberId),
    onSuccess: (data) => {
      if (data?.temporaryPassword) {
        setTempPassword(data.temporaryPassword)
        setCopied(false)
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to reset password")
    },
  })

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => organizationsApi.removeMember(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orgMembers"] })
      setRemoveTarget(null)
      toast.success(t("members.removeDialog.removedSuccessfully"))
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to remove member")
    },
  })

  const openEditDialog = useCallback((member: OrgMember) => {
    setEditTarget(member)
    setEditFirstName(member.firstName)
    setEditLastName(member.lastName)
    setEditRole(member.role)
    setEditPlatform(member.platform)
    setEditPerms({
      canCreateTasks: member.canCreateTasks,
      canViewAllTasks: member.canViewAllTasks,
      canAssignTasks: member.canAssignTasks,
      canManageUsers: member.canManageUsers,
    })
    setTempPassword(null)
    setCopied(false)
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

  const handleSave = () => {
    if (!editTarget) return
    updateMemberMutation.mutate({
      memberId: editTarget.id,
      data: {
        firstName: editFirstName,
        lastName: editLastName,
        role: editRole,
        platform: editPlatform,
        ...editPerms,
      },
    })
  }

  const handleCopyPassword = async () => {
    if (!tempPassword) return
    await navigator.clipboard.writeText(tempPassword)
    setCopied(true)
    toast.success(t("common.passwordCopiedToClipboard"))
    setTimeout(() => setCopied(false), 3000)
  }

  const members = data?.data || []
  const meta = data?.meta

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="max-w-screen-xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                {t("members.title")}
              </h1>
              <p className="mt-1.5 text-slate-500">
                {t("members.subtitle")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder={t("members.searchPlaceholder")}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  className="pl-10 w-72 h-11 bg-white/80 backdrop-blur-sm border-slate-200/80 rounded-xl shadow-sm focus:bg-white focus:shadow-md transition-all"
                />
              </div>

              {/* Role Filter */}
              <Select
                value={roleFilter}
                onValueChange={(v) => {
                  setRoleFilter(v)
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-[140px] h-11 bg-white/80 backdrop-blur-sm border-slate-200/80 rounded-xl shadow-sm">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.allRoles")}</SelectItem>
                  <SelectItem value="ADMIN">{t("members.roles.admin")}</SelectItem>
                  <SelectItem value="DISPATCHER">{t("members.roles.dispatcher")}</SelectItem>
                  <SelectItem value="TECHNICIAN">{t("members.roles.technician")}</SelectItem>
                </SelectContent>
              </Select>

              {/* Refresh */}
              <Button
                variant="outline"
                size="icon"
                onClick={() => refetch()}
                disabled={isLoading}
                className="h-11 w-11 bg-white/80 backdrop-blur-sm border-slate-200/80 rounded-xl shadow-sm hover:shadow-md transition-all"
              >
                <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
              </Button>

              {/* Invite */}
              <Link href="/invitations">
                <Button className="h-11 px-5 rounded-xl font-medium">
                  <UserPlus className="size-4 mr-2" />
                  {t("members.inviteMember")}
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="mb-4">
          <p className="text-sm text-slate-500">
            {meta ? t("members.showingCount", { count: members.length, total: meta.total, plural: meta.total !== 1 ? "s" : "" }) : ""}
          </p>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : members.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="w-[35%] font-semibold text-slate-600">{t("members.table.member")}</TableHead>
                  <TableHead className="font-semibold text-slate-600">{t("members.table.role")}</TableHead>
                  <TableHead className="font-semibold text-slate-600">{t("members.table.platform")}</TableHead>
                  <TableHead className="font-semibold text-slate-600">{t("members.table.status")}</TableHead>
                  <TableHead className="font-semibold text-slate-600">{t("members.table.joined")}</TableHead>
                  {isAdmin && <TableHead className="w-[60px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const roleBadge = ROLE_BADGES[member.role] || ROLE_BADGES.TECHNICIAN!
                  const platformBadge = PLATFORM_BADGES[member.platform] || PLATFORM_BADGES.WEB!
                  const isSelf = member.id === user?.id
                  return (
                    <TableRow key={member.id} className="hover:bg-slate-50/50">
                      <TableCell className="py-4">
                        <div>
                          <p className="font-medium text-slate-800">
                            {member.firstName} {member.lastName}
                            {isSelf && (
                              <span className="ml-2 text-xs text-slate-400">{t("common.you")}</span>
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
                          <Badge className="bg-green-100 text-green-700">{t("common.active")}</Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-500">{t("common.inactive")}</Badge>
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
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditDialog(member)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  {t("members.actions.editMember")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => setRemoveTarget(member)}
                                >
                                  <UserMinus className="h-4 w-4 mr-2" />
                                  {t("members.actions.remove")}
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
            <div className="text-center py-16 text-slate-500">
              <Users className="h-12 w-12 mx-auto mb-4 text-slate-300" />
              <p className="font-medium">{t("members.noMembersFound")}</p>
              <p className="text-sm text-slate-400 mt-1">{t("members.noMembersHint")}</p>
            </div>
          )}

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100">
              <p className="text-sm text-slate-500">
                {t("common.pageWithTotal", { page: meta.page, totalPages: meta.totalPages, total: meta.total })}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={meta.page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg"
                >
                  {t("common.previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={meta.page >= meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg"
                >
                  {t("common.next")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Member Dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null)
            setTempPassword(null)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("members.editDialog.title")}</DialogTitle>
            <DialogDescription>
              {editTarget && t("members.editDialog.description", { name: `${editTarget.firstName} ${editTarget.lastName}` })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            {/* Profile Section */}
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-3">{t("members.editDialog.profileSection")}</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="editFirstName">{t("members.editDialog.firstNameLabel")}</Label>
                  <Input
                    id="editFirstName"
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="editLastName">{t("members.editDialog.lastNameLabel")}</Label>
                  <Input
                    id="editLastName"
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Role & Permissions Section */}
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-3">{t("members.editDialog.roleAndPermissions")}</h4>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>{t("members.editDialog.roleLabel")}</Label>
                  <Select value={editRole} onValueChange={handleRoleChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">{t("members.roles.admin")}</SelectItem>
                      <SelectItem value="DISPATCHER">{t("members.roles.dispatcher")}</SelectItem>
                      <SelectItem value="TECHNICIAN">{t("members.roles.technician")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>{t("members.editDialog.platformLabel")}</Label>
                  <Select value={editPlatform} onValueChange={setEditPlatform}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WEB">{t("members.platforms.webOnly")}</SelectItem>
                      <SelectItem value="MOBILE">{t("members.platforms.mobileOnly")}</SelectItem>
                      <SelectItem value="BOTH">{t("members.platforms.both")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("members.editDialog.permissionsLabel")}</Label>
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
                        {t("members.editDialog.canCreateTasks")}
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
                        {t("members.editDialog.canViewAllTasks")}
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
                        {t("members.editDialog.canAssignTasks")}
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
                        {t("members.editDialog.canManageUsers")}
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Password Reset Section */}
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-3">{t("members.editDialog.passwordReset")}</h4>
              {tempPassword ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                    <p className="text-xs text-amber-700">
                      {t("members.editDialog.copyPasswordWarning")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={tempPassword}
                      className="font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopyPassword}
                      className="flex-shrink-0"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">
                    {t("members.editDialog.passwordResetDescription")}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => editTarget && resetPasswordMutation.mutate(editTarget.id)}
                    disabled={resetPasswordMutation.isPending}
                  >
                    <KeyRound className="h-4 w-4 mr-2" />
                    {resetPasswordMutation.isPending ? t("common.generating") : t("members.editDialog.resetPassword")}
                  </Button>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditTarget(null)
                setTempPassword(null)
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateMemberMutation.isPending || !editFirstName.trim() || !editLastName.trim()}
            >
              {updateMemberMutation.isPending ? t("common.saving") : t("common.saveChanges")}
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
            <AlertDialogTitle>{t("members.removeDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget && t("members.removeDialog.description", { name: `${removeTarget.firstName} ${removeTarget.lastName}` })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() =>
                removeTarget && removeMutation.mutate(removeTarget.id)
              }
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? t("common.removing") : t("members.removeDialog.removeButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
