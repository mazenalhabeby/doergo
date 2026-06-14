"use client"

import { useState, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Shield,
  Plus,
  ChevronRight,
  Users,
  Trash2,
  Pencil,
  X,
  Check,
} from "lucide-react"
import { notify } from "@/lib/toast"
import { PERMISSION_SCHEMA } from "@hbcfield/shared/client"

import { useAuth } from "@/contexts/auth-context"
import { rolesApi, type OrgRoleData } from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// ---------------------------------------------------------------------------
// Color presets for the color picker
// ---------------------------------------------------------------------------
const COLOR_PRESETS = [
  "#2563eb", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444",
  "#6366f1", "#ec4899", "#14b8a6", "#f97316", "#6b7280",
]

// Task creation scope options
const SCOPE_OPTIONS = [
  { value: "NONE", label: "No access" },
  { value: "SELF", label: "Self only" },
  { value: "SPACE", label: "Own spaces" },
  { value: "ORG", label: "Entire organization" },
]

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function RolesPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<OrgRoleData | null>(null)

  // Fetch roles
  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: rolesApi.list,
  })

  const selectedRole = roles.find((r) => r.id === selectedRoleId) || null

  if (!user?.canManageUsers) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">You do not have permission to manage roles.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Roles</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define roles and permissions for your organization.
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Create Role
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Left: Role list */}
        <div className="border rounded-xl bg-card">
          <div className="px-4 py-3 border-b">
            <h2 className="text-sm font-semibold text-foreground">Organization Roles</h2>
          </div>
          <div className="divide-y">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-3">
                  <Skeleton className="h-3 w-3 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-12 ml-auto" />
                </div>
              ))
            ) : (
              roles.map((role) => (
                <button
                  key={role.id}
                  onClick={() => setSelectedRoleId(role.id)}
                  className={cn(
                    "w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-accent/50 transition-colors",
                    selectedRoleId === role.id && "bg-accent"
                  )}
                >
                  <div
                    className="h-3 w-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: role.color || "#6b7280" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{role.name}</span>
                      {role.isSystem && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          System
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {role._count?.users || 0}
                    </span>
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: Role editor */}
        {selectedRole ? (
          <RoleEditor
            role={selectedRole}
            onDelete={() => setDeleteTarget(selectedRole)}
          />
        ) : (
          <div className="border rounded-xl bg-card flex items-center justify-center h-96">
            <div className="text-center">
              <Shield className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Select a role to edit permissions</p>
            </div>
          </div>
        )}
      </div>

      {/* Create role dialog */}
      <CreateRoleDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete role &ldquo;{deleteTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              {(deleteTarget?._count?.users || 0) > 0
                ? `${deleteTarget?._count?.users} user(s) will be reassigned to the Employee role.`
                : "This role has no users assigned."}
              {" "}This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <DeleteRoleButton
              roleId={deleteTarget?.id || ""}
              onSuccess={() => {
                setDeleteTarget(null)
                if (selectedRoleId === deleteTarget?.id) setSelectedRoleId(null)
              }}
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Role Editor
// ---------------------------------------------------------------------------
function RoleEditor({
  role,
  onDelete,
}: {
  role: OrgRoleData
  onDelete: () => void
}) {
  const queryClient = useQueryClient()
  const permissions = (role.permissions || {}) as Record<string, any>

  // Mutation for updating permissions
  const updatePermsMutation = useMutation({
    mutationFn: (perms: Record<string, any>) =>
      rolesApi.updatePermissions(role.id, perms),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] })
      notify.success("Permissions updated")
    },
    onError: (err: Error) => notify.error(err.message),
  })

  // Mutation for updating role metadata
  const updateRoleMutation = useMutation({
    mutationFn: (data: { name?: string; description?: string; color?: string }) =>
      rolesApi.update(role.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] })
      notify.success("Role updated")
    },
    onError: (err: Error) => notify.error(err.message),
  })

  const togglePermission = useCallback(
    (key: string) => {
      const newPerms = { ...permissions, [key]: !permissions[key] }
      updatePermsMutation.mutate(newPerms)
    },
    [permissions, updatePermsMutation]
  )

  const setScopeValue = useCallback(
    (value: string) => {
      const newPerms = { ...permissions, taskCreationScope: value }
      updatePermsMutation.mutate(newPerms)
    },
    [permissions, updatePermsMutation]
  )

  const enabledCount = PERMISSION_SCHEMA.flatMap((g: any) => g.permissions)
    .filter((p: any) => permissions[p.key] === true).length

  return (
    <div className="border rounded-xl bg-card">
      {/* Header */}
      <div className="px-6 py-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="h-4 w-4 rounded-full"
            style={{ backgroundColor: role.color || "#6b7280" }}
          />
          <div>
            <h2 className="text-lg font-semibold">{role.name}</h2>
            {role.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>
            )}
          </div>
          {role.isSystem && (
            <Badge variant="secondary" className="text-xs">System</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {enabledCount} permission{enabledCount !== 1 ? "s" : ""}
          </span>
          {role._count?.users ? (
            <Badge variant="outline" className="text-xs gap-1">
              <Users className="h-3 w-3" />
              {role._count.users}
            </Badge>
          ) : null}
          {!role.isSystem && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Color picker */}
      <div className="px-6 py-4 border-b">
        <Label className="text-xs font-medium text-muted-foreground">Color</Label>
        <div className="flex items-center gap-2 mt-2">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c}
              onClick={() => updateRoleMutation.mutate({ color: c })}
              className={cn(
                "h-6 w-6 rounded-full transition-all",
                role.color === c ? "ring-2 ring-offset-2 ring-foreground" : "hover:scale-110"
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {/* Task creation scope */}
      <div className="px-6 py-4 border-b">
        <Label className="text-xs font-medium text-muted-foreground">Task Creation Scope</Label>
        <p className="text-xs text-muted-foreground/70 mt-0.5 mb-2">
          Controls who this role can create tasks for
        </p>
        <Select
          value={permissions.taskCreationScope || "NONE"}
          onValueChange={setScopeValue}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCOPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Permissions grid */}
      <div className="divide-y">
        {PERMISSION_SCHEMA.map((group) => (
          <div key={group.group} className="px-6 py-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {group.group}
            </h3>
            <div className="space-y-3">
              {group.permissions.map((perm) => (
                <label
                  key={perm.key}
                  className="flex items-start gap-3 cursor-pointer group"
                >
                  <Checkbox
                    checked={permissions[perm.key] === true}
                    onCheckedChange={() => togglePermission(perm.key)}
                    className="mt-0.5"
                    disabled={updatePermsMutation.isPending}
                  />
                  <div>
                    <span className="text-sm font-medium text-foreground group-hover:text-foreground/80 transition-colors">
                      {perm.label}
                    </span>
                    <p className="text-xs text-muted-foreground">{perm.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Affected users indicator */}
      {(role._count?.users || 0) > 0 && (
        <div className="px-6 py-3 bg-muted/30 border-t text-xs text-muted-foreground flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          {role._count?.users} user{(role._count?.users || 0) !== 1 ? "s" : ""} will be affected by permission changes
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create Role Dialog
// ---------------------------------------------------------------------------
function CreateRoleDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [color, setColor] = useState("#6b7280")

  const createMutation = useMutation({
    mutationFn: () => rolesApi.create({ name, description: description || undefined, color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] })
      notify.success(`Role "${name}" created`)
      onOpenChange(false)
      setName("")
      setDescription("")
      setColor("#6b7280")
    },
    onError: (err: Error) => notify.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Role</DialogTitle>
          <DialogDescription>
            New roles start with no permissions. You can configure them after creation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="role-name">Name</Label>
            <Input
              id="role-name"
              placeholder="e.g., Inspector, Team Lead"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role-desc">Description (optional)</Label>
            <Input
              id="role-desc"
              placeholder="Brief description of this role"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex items-center gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-6 w-6 rounded-full transition-all",
                    color === c ? "ring-2 ring-offset-2 ring-foreground" : "hover:scale-110"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Delete Role Button
// ---------------------------------------------------------------------------
function DeleteRoleButton({
  roleId,
  onSuccess,
}: {
  roleId: string
  onSuccess: () => void
}) {
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: () => rolesApi.delete(roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] })
      notify.success("Role deleted")
      onSuccess()
    },
    onError: (err: Error) => notify.error(err.message),
  })

  return (
    <AlertDialogAction
      onClick={() => deleteMutation.mutate()}
      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
      disabled={deleteMutation.isPending}
    >
      {deleteMutation.isPending ? "Deleting..." : "Delete"}
    </AlertDialogAction>
  )
}
