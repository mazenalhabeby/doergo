"use client"

import { keys } from "@/lib/query-keys"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, UserPlus } from "lucide-react"
import { notify } from "@/lib/toast"
import { useAuth } from "@/contexts/auth-context"
import { mayListOrgMembers, type AssignablePerson } from "@/lib/assignable-members"
import { useAssignableMembers } from "@/hooks/use-assignable-members"
import { organizationsApi, spaceMembersApi } from "@/lib/api"
import { personName, jobTitleOf, type SpaceMember, type SpaceRoleInSpace } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { BILL_BY, roleQueryKey, Segmented, useBillByLabel, type BillBy } from "./work-roles"
import { NONE } from "./role-tag"

/** Add somebody: who, their role (trade or management), and — for a trade — how they are billed. */
export function AddMemberDialog({
  spaceId,
  roles,
  members,
  isClient,
  onClose,
}: {
  spaceId: string
  roles: SpaceRoleInSpace[]
  members: SpaceMember[]
  isClient: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const billByLabel = useBillByLabel()
  const [userId, setUserId] = useState("")
  const [roleId, setRoleId] = useState(NONE)
  const [bill, setBill] = useState<BillBy>("HOUR")

  /*
    Everyone on the staff — admins and managers included — paged through, not
    the first hundred. `lite`: a name, an avatar and a job title is all a picker draws.
  */
  //
  // ⚠️ The directory is `canManageUsers`; a workspace manager adds people
  // (canManageWorkspaces in the space) without holding it. For them the
  // candidates are the people on the workspaces they can see — the most this
  // product lets them read (lib/assignable-members.ts).
  const { user } = useAuth()
  const mayListOrg = mayListOrgMembers(user)
  const { data: orgPeople } = useQuery({
    queryKey: keys.members.directoryLite(),
    queryFn: () => organizationsApi.getAllMembers({ lite: true }),
    enabled: mayListOrg,
  })
  const { members: visiblePeople } = useAssignableMembers({ enabled: !mayListOrg })
  const assigned = new Set(members.map((m) => m.userId))
  const candidates: AssignablePerson[] = mayListOrg ? (orgPeople ?? []) : visiblePeople
  const available = candidates.filter((e) => e.isActive !== false && !assigned.has(e.id))
  const dupes = useMemo(() => {
    const seen = new Set<string>(),
      d = new Set<string>()
    for (const e of available) {
      const n = personName(e).toLowerCase()
      if (seen.has(n)) d.add(n)
      seen.add(n)
    }
    return d
  }, [available])
  const picked = roles.find((r) => r.id === roleId)

  const add = useMutation({
    mutationFn: async () => {
      const m = await spaceMembersApi.assign(spaceId, { userId, spaceRoleId: roleId === NONE ? null : roleId })
      // Billing only means something for a trade on a client's workspace.
      if (m?.id && picked?.kind === "WORK" && isClient && bill !== "HOUR") {
        await spaceMembersApi.updateRoles(spaceId, m.id, { billBy: bill })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.spaceMembers.list(spaceId) })
      queryClient.invalidateQueries({ queryKey: roleQueryKey(spaceId) })
      notify.success(t("scheduling.members.toast.added"))
      onClose()
    },
    onError: (e: Error) => notify.error(e.message || t("scheduling.members.toast.addFailed")),
  })

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("scheduling.membersPage.addMember")}</DialogTitle>
          <DialogDescription>{t("scheduling.members.intro")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("scheduling.members.fields.member")}</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder={t("scheduling.members.selectMember")} />
              </SelectTrigger>
              <SelectContent>
                {available.length === 0 ? (
                  <div className="p-2 text-center text-sm text-muted-foreground">
                    {t("scheduling.members.noAvailable")}
                  </div>
                ) : (
                  available.map((e) => {
                    const title = jobTitleOf(e)
                    const showEmail = dupes.has(personName(e).toLowerCase())
                    return (
                      <SelectItem key={e.id} value={e.id}>
                        <span className="flex flex-col items-start">
                          <span>{personName(e)}</span>
                          {(title || showEmail) && (
                            <span className="text-xs text-muted-foreground">
                              {[title, showEmail ? e.email : null].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    )
                  })
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("scheduling.members.fields.role")}</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("scheduling.members.noRole")}</SelectItem>
                {(
                  [
                    ["WORK", t("scheduling.workRoles.groupWork")],
                    ["MANAGEMENT", t("scheduling.workRoles.groupManagement")],
                  ] as const
                ).map(([kind, label]) => {
                  // Work roles: only those this workspace uses.
                  const group = roles.filter(
                    (r) => (r.kind === "WORK") === (kind === "WORK") && (r.kind !== "WORK" || r.activeHere !== false),
                  )
                  if (group.length === 0) return null
                  return (
                    <SelectGroup key={kind}>
                      <SelectLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {label}
                      </SelectLabel>
                      {group.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
          {picked?.kind === "WORK" && isClient && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("scheduling.workRoles.billBy")}</Label>
              <div>
                <Segmented
                  ariaLabel={t("scheduling.workRoles.billBy")}
                  value={bill}
                  onChange={setBill}
                  options={BILL_BY.map((b) => ({ value: b, label: billByLabel(b) }))}
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={add.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => add.mutate()} disabled={!userId || add.isPending} className="gap-1.5">
            {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {t("scheduling.members.addButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
