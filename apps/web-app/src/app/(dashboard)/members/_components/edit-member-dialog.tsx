"use client"

import { useState, useEffect, useMemo, memo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Check, Copy, KeyRound, AlertTriangle, MapPin, X, Plus, ChevronsUpDown } from "lucide-react"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/user-avatar"
import { ScheduleFields, createDefaultSchedule, type EditableScheduleRow } from "@/components/schedule-fields"
import {
  organizationsApi,
  locationsApi,
  employeesApi,
  type OrgMember,
  type UpdateMemberInput,
  type ScheduleEntryInput,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"

// ── Constants ────────────────────────────────────────────────────────────────

const POSITION_SUGGESTIONS = [
  "Technician", "Driver", "Accountant", "HR Manager", "Sales Representative",
  "Office Manager", "Warehouse Worker", "Service Engineer", "Project Manager",
  "Designer", "Developer", "Customer Support", "Delivery Driver", "Inspector",
]

// ── Sub-components ─────────────────────────────────────────────────────────────

const PositionCombobox = memo(function PositionCombobox({
  value,
  onChange,
  usedPositions,
}: {
  value: string
  onChange: (value: string) => void
  usedPositions: string[]
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState(value)

  const unusedSuggestions = POSITION_SUGGESTIONS.filter(
    (s) => !usedPositions.some((u) => u.toLowerCase() === s.toLowerCase()),
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
            {value || t("members.memberEditor.positionPlaceholder")}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={true}>
          <div className="p-2 pb-1">
            <CommandInput
              placeholder={t("members.memberEditor.searchOrType")}
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
                  {t("members.memberEditor.useQuery", { query: inputValue })}
                </button>
              </CommandEmpty>
              {usedPositions.length > 0 && (
                <CommandGroup heading={t("members.memberEditor.usedInOrg")}>
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
                  <CommandGroup heading={t("members.memberEditor.suggestions")}>
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

function EditSection({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

// ── Dialog ─────────────────────────────────────────────────────────────────────

/**
 * Self-contained Edit Member dialog — used by both the Members list and the
 * member detail page (so the same editor opens in place, no redirect).
 * Pass `member` to open; `null` keeps it closed.
 */
export function EditMemberDialog({
  member,
  onClose,
  onSaved,
}: {
  member: OrgMember | null
  onClose: () => void
  onSaved?: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [position, setPosition] = useState("")
  const [scheduleType, setScheduleType] = useState("NONE")
  const [monthlyHourBudget, setMonthlyHourBudget] = useState<number | "">("")
  const [scheduleRows, setScheduleRows] = useState<EditableScheduleRow[]>(createDefaultSchedule())
  const [role, setRole] = useState("")
  // "Show in Management" — surfaces this member (with their sub-role/title) in the
  // Management directory teammates use to reach leadership. Decoupled from the
  // permission role: an EMPLOYEE can be shown without being made an admin/manager.
  const [contactable, setContactable] = useState(false)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Initialize form whenever a (new) member is opened.
  useEffect(() => {
    if (!member) return
    setFirstName(member.firstName)
    setLastName(member.lastName)
    setPosition(member.position || "")
    setScheduleType(member.scheduleType || "NONE")
    setMonthlyHourBudget(member.monthlyHourBudget ?? "")
    setRole(member.role)
    setContactable(member.contactable ?? false)
    setScheduleRows(createDefaultSchedule())
    setTempPassword(null)
    setCopied(false)
  }, [member])

  // ── Data (self-contained; shared query keys dedupe across pages) ──
  const { data: membersData } = useQuery({
    queryKey: ["orgMembers", "positions"],
    queryFn: () => organizationsApi.getMembers({ limit: 200 }),
    enabled: !!member,
    staleTime: 60000,
  })
  const usedPositions = useMemo(() => {
    const set = new Set<string>()
    for (const m of membersData?.data || []) if (m.position) set.add(m.position)
    return Array.from(set).sort()
  }, [membersData])


  const { data: locationsData } = useQuery({
    queryKey: ["locations-all"],
    queryFn: () => locationsApi.list({ limit: 100 }),
    staleTime: 60000,
    enabled: !!member,
  })
  const locations = locationsData?.data || []

  const { data: allAssignments } = useQuery({
    queryKey: ["all-location-assignments", locations.length],
    queryFn: async () => {
      const results = await Promise.allSettled(
        locations.map(async (loc) => {
          const assignments = await locationsApi.getAssignedMembers(loc.id)
          return assignments.map((a) => ({ ...a, locationName: loc.name }))
        }),
      )
      return results
        .filter((r): r is PromiseFulfilledResult<any[]> => r.status === "fulfilled")
        .flatMap((r) => r.value)
    },
    enabled: !!member && locations.length > 0,
    staleTime: 60000,
  })

  const { data: scheduleData } = useQuery({
    queryKey: ["employeeSchedule", member?.id],
    queryFn: () => employeesApi.getSchedule(member!.id),
    enabled: !!member && scheduleType === "FIXED",
  })

  useEffect(() => {
    if (scheduleData?.schedule && scheduleData.schedule.length > 0) {
      const rows = createDefaultSchedule()
      for (const entry of scheduleData.schedule) {
        const row = rows[entry.dayOfWeek]
        if (row) {
          row.startTime = entry.startTime
          row.endTime = entry.endTime
          row.isActive = entry.isActive
        }
      }
      setScheduleRows(rows)
    }
  }, [scheduleData])

  // ── Mutations ──
  const updateMutation = useMutation({
    mutationFn: ({ memberId, data }: { memberId: string; data: UpdateMemberInput }) =>
      organizationsApi.updateMember(memberId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orgMembers"] })
      onSaved?.()
      onClose()
      setTempPassword(null)
      notify.success(t("members.memberEditor.updated"))
    },
    onError: (error: Error) => notify.error(error.message || t("members.memberEditor.failedToUpdate")),
  })

  const resetPasswordMutation = useMutation({
    mutationFn: (memberId: string) => organizationsApi.resetMemberPassword(memberId),
    onSuccess: (data) => {
      if (data?.temporaryPassword) {
        setTempPassword(data.temporaryPassword)
        setCopied(false)
      }
    },
    onError: (error: Error) => notify.error(error.message || t("members.memberEditor.failedToResetPassword")),
  })

  const saveScheduleMutation = useMutation({
    mutationFn: ({ memberId, schedule }: { memberId: string; schedule: ScheduleEntryInput[] }) =>
      employeesApi.setSchedule(memberId, schedule),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employeeSchedule"] }),
    onError: (error: Error) => notify.error(error.message || t("members.memberEditor.failedToSaveSchedule")),
  })

  const handleSave = () => {
    if (!member) return
    if (scheduleType === "FIXED") {
      saveScheduleMutation.mutate({
        memberId: member.id,
        schedule: scheduleRows.map((row) => ({
          dayOfWeek: row.dayOfWeek,
          startTime: row.startTime,
          endTime: row.endTime,
          isActive: row.isActive,
        })),
      })
    } else if (member.scheduleType === "FIXED") {
      // Switching away from a fixed schedule — clear the now-stale weekly rows
      // (the backend deletes-then-recreates, so an empty array wipes them).
      saveScheduleMutation.mutate({ memberId: member.id, schedule: [] })
    }
    updateMutation.mutate({
      memberId: member.id,
      data: {
        firstName,
        lastName,
        position: position || undefined,
        scheduleType,
        monthlyHourBudget:
          scheduleType === "FLEXIBLE" && monthlyHourBudget !== "" ? Number(monthlyHourBudget) : undefined,
        role,
        contactable,
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

  const invalidateAssignments = () => queryClient.invalidateQueries({ queryKey: ["all-location-assignments"] })

  return (
    <Dialog
      open={!!member}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
          setTempPassword(null)
        }
      }}
    >
      <DialogContent className="max-w-lg px-6">
        <DialogHeader>
          {member && (
            <div className="flex items-center gap-3 text-left">
              <UserAvatar firstName={member.firstName} lastName={member.lastName} avatarUrl={member.avatarUrl} seed={member.id} size="lg" />
              <div className="min-w-0">
                <DialogTitle className="text-base truncate">{member.firstName} {member.lastName}</DialogTitle>
                <DialogDescription className="text-xs truncate">{member.email}</DialogDescription>
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto overflow-x-hidden px-1">
          <EditSection label={t("members.memberEditor.sectionProfile")} />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="editFirstName" className="text-xs font-medium text-muted-foreground">{t("members.memberEditor.firstName")}</Label>
              <Input id="editFirstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-9 focus-visible:ring-offset-0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="editLastName" className="text-xs font-medium text-muted-foreground">{t("members.memberEditor.lastName")}</Label>
              <Input id="editLastName" value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-9 focus-visible:ring-offset-0" />
            </div>
          </div>

          {/* Sub-role / title — a free-text designation (e.g. "Logistics Manager",
              "Team Lead") independent of the permission role, plus an explicit
              choice to surface this person in the Management directory. */}
          <div className="space-y-2.5 rounded-lg border border-border/60 p-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">{t("members.memberEditor.subRole", "Sub-role / title")}</Label>
              <PositionCombobox value={position} onChange={setPosition} usedPositions={usedPositions} />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-2.5">
              <div className="min-w-0">
                <Label className="text-xs font-medium text-foreground">{t("members.memberEditor.showInManagement", "Show in Management")}</Label>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {role === "ADMIN"
                    ? t("members.memberEditor.showInManagementAdmin", "Admins always appear in the Management directory.")
                    : t("members.memberEditor.showInManagementHint", "Lists this person (with their sub-role) so teammates can reach them from anywhere.")}
                </p>
              </div>
              <Switch
                checked={role === "ADMIN" ? true : contactable}
                disabled={role === "ADMIN"}
                onCheckedChange={setContactable}
              />
            </div>
          </div>

          <EditSection label={t("members.memberEditor.sectionWorkSchedule")} />

          <ScheduleFields
            scheduleType={scheduleType}
            onScheduleTypeChange={setScheduleType}
            scheduleRows={scheduleRows}
            onScheduleRowsChange={setScheduleRows}
            monthlyHourBudget={monthlyHourBudget}
            onMonthlyHourBudgetChange={setMonthlyHourBudget}
          />

          {/* Remote clock-in moved to the member's Access tab (single config home). */}

          <EditSection label={t("members.memberEditor.sectionRoleAccess")} />

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{t("members.memberEditor.role")}</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">{t("members.roles.admin")}</SelectItem>
                <SelectItem value="EMPLOYEE">{t("members.roles.employee")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {member && (
            <>
              <EditSection label={t("members.table.spaces")} />
              <div className="flex flex-wrap gap-1.5 items-center">
                {(() => {
                  const memberAssignments = (allAssignments || []).filter(
                    (a: any) => a.userId === member.id || a.technicianId === member.id,
                  )
                  const assignedLocationIds = new Set(memberAssignments.map((a: any) => a.locationId || a.companyLocationId))
                  const assignedLocations = locations.filter((l: any) => assignedLocationIds.has(l.id))
                  const unassignedLocations = locations.filter((l: any) => !assignedLocationIds.has(l.id))

                  return (
                    <>
                      {assignedLocations.length > 0 ? (
                        assignedLocations.map((loc: any) => {
                          const assignment = memberAssignments.find((a: any) => (a.locationId || a.companyLocationId) === loc.id)
                          return (
                            <Badge key={loc.id} variant="secondary" className="text-xs font-normal py-0.5 px-2 pr-1 gap-1">
                              <MapPin className="h-3 w-3" />
                              {loc.name}
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!assignment?.id) return
                                  try {
                                    await locationsApi.removeAssignment(loc.id, assignment.id)
                                    invalidateAssignments()
                                    notify.success(t("members.memberEditor.removedFrom", { name: loc.name }))
                                  } catch { notify.error(t("members.memberEditor.failedToRemove")) }
                                }}
                                className="ml-0.5 p-0.5 rounded hover:bg-destructive/20 transition-colors"
                              >
                                <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                              </button>
                            </Badge>
                          )
                        })
                      ) : (
                        <span className="text-sm text-muted-foreground/50 italic">{t("members.noSpaces")}</span>
                      )}
                      {unassignedLocations.length > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-6 px-2 text-xs rounded-full gap-1">
                              <Plus className="h-3 w-3" />
                              {t("members.memberEditor.add")}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-48">
                            {unassignedLocations.map((loc: any) => (
                              <DropdownMenuItem
                                key={loc.id}
                                onClick={async () => {
                                  try {
                                    await locationsApi.assignMember(loc.id, { userId: member.id })
                                    invalidateAssignments()
                                    notify.success(t("members.memberEditor.assignedTo", { name: loc.name }))
                                  } catch { notify.error(t("members.memberEditor.failedToAssign")) }
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
            </>
          )}

          <EditSection label={t("members.memberEditor.sectionSecurity")} />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">{t("members.memberEditor.password")}</Label>
              {!tempPassword && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => member && resetPasswordMutation.mutate(member.id)}
                  disabled={resetPasswordMutation.isPending}
                  className="h-7 text-xs"
                >
                  <KeyRound className="h-3 w-3 mr-1.5" />
                  {resetPasswordMutation.isPending ? t("common.generating") : t("members.memberEditor.resetPassword")}
                </Button>
              )}
            </div>
            {tempPassword ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">{t("members.memberEditor.copyPasswordWarning")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input readOnly value={tempPassword} className="font-mono text-sm h-9" />
                  <Button variant="outline" size="icon" onClick={handleCopyPassword} className="h-9 w-9 flex-shrink-0">
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setTempPassword(null) }} className="rounded-lg">
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending || !firstName.trim() || !lastName.trim()} className="rounded-lg">
            {updateMutation.isPending ? t("common.saving") : t("common.saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
