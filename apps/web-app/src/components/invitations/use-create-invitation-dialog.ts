"use client"

import { keys } from "@/lib/query-keys"
import { useState, useCallback, useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { notify } from "@/lib/toast"
import { useAuth } from "@/contexts/auth-context"
import { invitationsApi, organizationsApi, type CreateInvitationInput } from "@/lib/api"
import { createDefaultSchedule, type EditableScheduleRow } from "@/components/people/schedule-fields"
import {
  defaultAccessDraft,
  serializeAccessDraft,
  getDefaultModules,
  permissionsFromChoice,
} from "@hbcfield/shared/client"
import type { AccessDraft, PermissionChoice } from "@hbcfield/shared/client"
import { presetChoice, withoutMissingModules } from "@/lib/permission-builder"
import { useSpaceModules } from "@/hooks/use-space-modules"
import { copyText } from "@/lib/clipboard"
import { useActiveSpaces } from "@/hooks/use-space-directory"

export interface CreateInvitationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** CreateInvitationDialog's state and handlers — everything before its markup, moved here unchanged. */
export function useCreateInvitationDialog({ open, onOpenChange }: Pick<CreateInvitationDialogProps, 'open' | 'onOpenChange'>) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Form state
  const [mode, setMode] = useState<"email" | "code">("email")
  const [email, setEmail] = useState("")
  const [position, setPosition] = useState("")
  const [isExternal, setIsExternal] = useState(false)
  const [scheduleType, setScheduleType] = useState("NONE")
  const [scheduleRows, setScheduleRows] = useState<EditableScheduleRow[]>(createDefaultSchedule())
  const [monthlyHourBudget, setMonthlyHourBudget] = useState<number | "">("")
  const [spaceId, setSpaceId] = useState("none")
  /*
    Which kind of outsider.

    An external member's whole authority is one space role, so which one they
    are IS the invitation. Two answers in practice: a Supervisor who approves
    our hours and follows the work, and an Observer who watches and can raise a
    job — no hours, no approvals, no assigning.

    Left unset the server applies its default (Supervisor), so an invite sent
    without touching this behaves exactly as before.
  */
  const [externalRoleId, setExternalRoleId] = useState("default")
  /*
    …or what they may do, set area by area (the permission builder), which is
    the default: the invitation carries the keys (`spacePermissions`) and the
    server keeps them as this person's own role on accept — or the shared role
    they exactly match. Starts at Supervisor, today's default.
  */
  const [externalMode, setExternalMode] = useState<"builder" | "role">("builder")
  const [externalChoice, setExternalChoice] = useState<PermissionChoice>(() => presetChoice("supervisor", { isExternal: true }))

  // Access Profile pre-config — applied to the member on accept, so their first
  // screen already matches their final access (no post-registration change).
  const [access, setAccess] = useState<AccessDraft>(() => defaultAccessDraft())
  const [accessOpen, setAccessOpen] = useState(false)
  const [accessTouched, setAccessTouched] = useState(false)
  const patchAccess = useCallback((p: Partial<AccessDraft>) => {
    setAccessTouched(true)
    setAccess((cur) => ({ ...cur, ...p }))
  }, [])

  // Success state
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)

  // Fetch spaces
  const { data: locations = [] } = useActiveSpaces({ enabled: open })

  /*
    An external member works in exactly ONE workspace, and that workspace is
    what says which client they belong to — so no company is recorded against
    the person. A second field would restate the workspace by hand and be free
    to disagree with it.
  */
  const hasSpace = isExternal && spaceId !== "none" && !!spaceId
  // What the chosen workspace runs, so areas it cannot use are greyed out (and not sent).
  const { enabledModules: spaceModules, isResolved: spaceModulesResolved } = useSpaceModules(hasSpace ? spaceId : null)
  const builderModules = hasSpace && spaceModulesResolved ? spaceModules : undefined
  // Space-scoped roles only — an org role reaches every space, which is exactly
  // what an outsider must never have. The server refuses one regardless.
  const { data: spaceRoles = [] } = useQuery({
    queryKey: keys.organization.roles("space"),
    queryFn: () => organizationsApi.getRoles("space"),
    staleTime: 300000,
    enabled: open && isExternal,
  })

  const createMutation = useMutation({
    mutationFn: (input: CreateInvitationInput) => invitationsApi.create(input),
    onSuccess: (data) => {
      const code = data?.code
      if (code) {
        setGeneratedCode(code)
        setSuccess(true)
        // A courtesy copy on creation: silent, the Copy button reports for itself.
        void copyText(code, { silent: true })
      }
      queryClient.invalidateQueries({ queryKey: keys.people.invitations() })
      queryClient.invalidateQueries({ queryKey: keys.people.pendingInvitations() })
    },
    onError: (error: Error) => {
      notify.error(error.message || t("invitations.inviteDialog.failedToCreate"))
    },
  })

  const handleSubmit = useCallback(() => {
    // Invitations are always for Employees; management is granted via permissions.
    const input: CreateInvitationInput = { targetRole: "EMPLOYEE" }
    if (mode === "email" && email.trim()) input.email = email.trim()
    if (position.trim()) input.position = position.trim()
    if (scheduleType !== "NONE") input.scheduleType = scheduleType
    if (scheduleType === "FIXED") {
      input.schedule = scheduleRows.map((r) => ({
        dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime, isActive: r.isActive,
      }))
    }
    if (scheduleType === "FLEXIBLE" && monthlyHourBudget !== "") {
      input.monthlyHourBudget = Number(monthlyHourBudget)
    }
    if (spaceId && spaceId !== "none") input.spaceId = spaceId
    // Pre-assigned role (validated server-side) + pre-configured access → both
    // applied to the new member on accept, so their first screen already matches.
    if (isExternal) {
      // Their authority comes from a SPACE role, never an org-wide one. The
      // server validates the scope and refuses anything else.
      input.isExternal = true
      if (externalMode === "builder") {
        input.spacePermissions = permissionsFromChoice(withoutMissingModules(externalChoice, builderModules))
      } else if (externalRoleId !== "default") {
        input.memberRoleId = externalRoleId
      }
    } else if (access.memberRoleId) {
      input.memberRoleId = access.memberRoleId
    }
    input.accessProfile = serializeAccessDraft(access)
    createMutation.mutate(input)
  }, [
    mode,
    email,
    position,
    scheduleType,
    scheduleRows,
    monthlyHourBudget,
    spaceId,
    access,
    isExternal,
    externalMode,
    externalChoice,
    externalRoleId,
    builderModules,
    createMutation])

  // Keep the feature tabs in sync with the position until the admin edits access
  // themselves (then their choices win).
  const handlePositionChange = useCallback((next: string) => {
    setPosition(next)
    if (!accessTouched) setAccess((cur) => ({ ...cur, modules: getDefaultModules(next.trim() || null) }))
  }, [accessTouched])

  const platformSummary = useMemo(() => {
    const key = access.platforms === "web"
      ? "accessBuilder.platforms.webOnly"
      : access.platforms === "mobile"
      ? "accessBuilder.platforms.mobileOnly"
      : "accessBuilder.platforms.both"
    return t(key)
  }, [access.platforms, t])

  const handleCopyCode = useCallback(async () => {
    if (!generatedCode) return
    if (!(await copyText(generatedCode))) return
    setCodeCopied(true)
    notify.success(t("invitations.inviteDialog.codeCopied"))
    setTimeout(() => setCodeCopied(false), 3000)
  }, [generatedCode])

  const handleSendAnother = useCallback(() => {
    setGeneratedCode(null)
    setSuccess(false)
    setEmail("")
    setPosition("")
    setScheduleType("NONE")
  setScheduleRows(createDefaultSchedule())
  setMonthlyHourBudget("")
    setAccess(defaultAccessDraft())
    setAccessOpen(false)
    setAccessTouched(false)
    setCodeCopied(false)
    setExternalMode("builder")
    setExternalChoice(presetChoice("supervisor", { isExternal: true }))
  }, [])

  const handleClose = useCallback(() => {
    onOpenChange(false)
    setTimeout(() => {
      setMode("email")
      setEmail("")
      setPosition("")
      setScheduleType("NONE")
  setScheduleRows(createDefaultSchedule())
  setMonthlyHourBudget("")
      setSpaceId("none")
      setAccess(defaultAccessDraft())
      setAccessOpen(false)
      setAccessTouched(false)
      setGeneratedCode(null)
      setSuccess(false)
      setCodeCopied(false)
      setExternalMode("builder")
      setExternalChoice(presetChoice("supervisor", { isExternal: true }))
      createMutation.reset()
    }, 200)
  }, [onOpenChange, createMutation])

  return {
    t,
    mode,
    setMode,
    email,
    setEmail,
    position,
    isExternal,
    setIsExternal,
    scheduleType,
    setScheduleType,
    scheduleRows,
    setScheduleRows,
    monthlyHourBudget,
    setMonthlyHourBudget,
    spaceId,
    setSpaceId,
    externalRoleId,
    setExternalRoleId,
    externalMode,
    setExternalMode,
    externalChoice,
    setExternalChoice,
    access,
    setAccess,
    accessOpen,
    setAccessOpen,
    patchAccess,
    generatedCode,
    success,
    codeCopied,
    locations,
    hasSpace,
    spaceModules,
    builderModules,
    spaceRoles,
    createMutation,
    handleSubmit,
    handlePositionChange,
    platformSummary,
    handleCopyCode,
    handleSendAnother,
    handleClose,
  }
}

/** What CreateInvitationDialog and its sections read. */
export type CreateInvitationDialogState = ReturnType<typeof useCreateInvitationDialog>
