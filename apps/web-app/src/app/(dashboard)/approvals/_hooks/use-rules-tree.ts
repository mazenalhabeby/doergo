"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ApprovalRuleInput, ApprovalRuleView, RuleKind } from "@hbcfield/shared/client"
import { approvalsApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { useOrgRoles } from "@/hooks/use-org-roles"
import { useSpaceDirectory } from "@/hooks/use-space-directory"

/** A role a rule may name: one that grants something (a work role grants nothing), with how many hold it. */
export interface RuleRole {
  id: string
  name: string
  inSpace: boolean
  holders: number
}

/** The fields a rule card edits — everything the server stores, nothing it fills in itself. */
export function ruleInput(r: ApprovalRuleView): ApprovalRuleInput {
  return {
    kind: r.kind,
    spaceId: r.spaceId,
    minMinutes: r.minMinutes,
    minDays: r.minDays,
    minAmountCents: r.minAmountCents,
    whenCoverShort: r.whenCoverShort,
    secondRoleId: r.secondRoleId,
    remindAfterHours: r.remindAfterHours,
    escalateAfterHours: r.escalateAfterHours,
    escalateRoleId: r.escalateRoleId,
    isActive: r.isActive,
  }
}

/**
 * "Who approves": the rules of ONE kind, read and written through the existing rules API
 * (`/approvals/rules`). Every change saves at once — the server checks it (ruleInputProblem) and
 * enforces it in each kind's own approve path.
 */
export function useRulesTree(enabled: boolean) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [kind, setKind] = useState<RuleKind>("overtime")

  const { data: rules, isLoading } = useQuery({
    queryKey: keys.approvals.rules(),
    queryFn: approvalsApi.rules,
    enabled,
  })
  const { data: orgRoles } = useOrgRoles(undefined, { enabled })
  const { data: spaceRoles } = useOrgRoles("space", { enabled })
  const { data: spaces } = useSpaceDirectory({ enabled })

  const roles = useMemo<RuleRole[]>(() => {
    const out = new Map<string, RuleRole>()
    const add = (list: typeof orgRoles, inSpace: boolean) =>
      (list ?? [])
        .filter((r) => Object.values(r.permissions ?? {}).some(Boolean))
        .forEach((r) => out.set(r.id, { id: r.id, name: r.name, inSpace, holders: r.memberCount ?? 0 }))
    add(orgRoles, false)
    add(spaceRoles, true)
    return [...out.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [orgRoles, spaceRoles])

  const workspaces = useMemo(
    () => (spaces ?? []).filter((s) => s.isActive !== false).map((s) => ({ id: s.id, name: s.name })),
    [spaces],
  )

  const refresh = () => qc.invalidateQueries({ queryKey: keys.approvals.all() })
  const fail = (e: Error) => notify.error(e.message)

  const save = useMutation({
    mutationFn: ({ input, id }: { input: ApprovalRuleInput; id?: string }) => approvalsApi.saveRule(input, id),
    onSuccess: refresh,
    onError: (e: Error) => {
      fail(e)
      refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => approvalsApi.deleteRule(id),
    onSuccess: () => {
      notify.success(t("approvals.tree.removed"))
      refresh()
    },
    onError: fail,
  })

  /** Change one rule: the cache moves at once, the server confirms (or the error puts it back). */
  const change = (r: ApprovalRuleView, patch: Partial<ApprovalRuleInput>) => {
    qc.setQueryData<ApprovalRuleView[]>(keys.approvals.rules(), (old) =>
      (old ?? []).map((x) => (x.id === r.id ? { ...x, ...patch } : x)),
    )
    save.mutate({ input: { ...ruleInput(r), ...patch }, id: r.id })
  }

  /**
   * A new rule — for one workspace, or every one when none is given. It asks the first role that can decide
   * for a second approval: a rule must DO something.
   */
  const add = (spaceId: string | null = null) => {
    const role = roles.find((r) => r.holders > 0) ?? roles[0]
    if (!role) return notify.error(t("approvals.tree.noRoles"))
    save.mutate({ input: { kind, spaceId, secondRoleId: role.id, isActive: true } })
  }

  const ofKind = (rules ?? []).filter((r) => r.kind === kind)
  return {
    kind,
    setKind,
    rules: ofKind,
    counts: rules ?? [],
    isLoading,
    roles,
    workspaces,
    change,
    add,
    remove,
    busy: save.isPending,
  }
}
