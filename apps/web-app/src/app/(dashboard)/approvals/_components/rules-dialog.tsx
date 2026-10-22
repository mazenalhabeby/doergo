"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Trash2 } from "lucide-react"
import { RULE_KINDS, formatMoney, type ApprovalRuleView, type RuleKind } from "@hbcfield/shared/client"

import { approvalsApi } from "@/lib/api"
import { keys } from "@/lib/query-keys"
import { notify } from "@/lib/toast"
import { dateLocale } from "@/lib/format-date"
import { useAuth } from "@/contexts/auth-context"
import { useSpaceDirectory } from "@/hooks/use-space-directory"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useOrgRoles } from "@/hooks/use-org-roles"

const ALL = "__all__"
const NONE = "__none__"

/**
 * The office's approval rules: past a threshold, a decision needs a second
 * person holding a role. Enforced in each kind's own approve path (task-service
 * `ApprovalRulesService`) — this only writes the rules.
 */
export function RulesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { user } = useAuth()
  const currency = user?.orgCurrency ?? "EUR"

  const { data: rules } = useQuery({ queryKey: keys.approvals.rules(), queryFn: approvalsApi.rules, enabled: open })
  const { data: orgRoles } = useOrgRoles(undefined, { enabled: open })
  const { data: spaceRoles } = useOrgRoles("space", { enabled: open })
  const { data: spaces } = useSpaceDirectory({ enabled: open })

  const roles = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>()
    for (const r of [...(orgRoles ?? []), ...(spaceRoles ?? [])]) byId.set(r.id, { id: r.id, name: r.name })
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [orgRoles, spaceRoles])

  const [kind, setKind] = useState<RuleKind>("overtime")
  const [spaceId, setSpaceId] = useState(ALL)
  const [threshold, setThreshold] = useState("")
  const [roleId, setRoleId] = useState(NONE)
  const [coverShort, setCoverShort] = useState(false)
  const [remind, setRemind] = useState("")
  const [escalate, setEscalate] = useState("")
  const [escalateRoleId, setEscalateRoleId] = useState(NONE)
  const hoursOf = (v: string) => (v.trim() === "" ? null : Math.round(Number(v)))
  const reset = () => {
    setThreshold("")
    setRoleId(NONE)
    setCoverShort(false)
    setRemind("")
    setEscalate("")
    setEscalateRoleId(NONE)
  }

  const refresh = () => qc.invalidateQueries({ queryKey: keys.approvals.all() })
  const save = useMutation({
    mutationFn: () => {
      const n = threshold.trim() === "" ? null : Number(threshold)
      return approvalsApi.saveRule({
        kind,
        spaceId: spaceId === ALL ? null : spaceId,
        secondRoleId: roleId === NONE ? null : roleId,
        whenCoverShort: kind === "request" && coverShort,
        remindAfterHours: hoursOf(remind),
        escalateAfterHours: hoursOf(escalate),
        escalateRoleId: escalateRoleId === NONE ? null : escalateRoleId,
        // Entered as hours / days / money; stored as minutes / days / cents.
        minMinutes: kind === "overtime" && n != null ? Math.round(n * 60) : null,
        minDays: kind === "request" && n != null ? Math.round(n) : null,
        minAmountCents: kind === "expense" && n != null ? Math.round(n * 100) : null,
      })
    },
    onSuccess: () => {
      reset()
      notify.success(t("approvals.rules.saved"))
      refresh()
    },
    onError: (e: Error) => notify.error(e.message),
  })
  const toggle = useMutation({
    mutationFn: (r: ApprovalRuleView) => approvalsApi.saveRule({ ...r, isActive: !r.isActive }, r.id),
    onSuccess: refresh,
    onError: (e: Error) => notify.error(e.message),
  })
  const remove = useMutation({
    mutationFn: (id: string) => approvalsApi.deleteRule(id),
    onSuccess: refresh,
    onError: (e: Error) => notify.error(e.message),
  })

  const describe = (r: ApprovalRuleView) => {
    const when =
      [
        r.kind === "overtime" && r.minMinutes != null
          ? t("approvals.rules.whenOvertime", { hours: Math.round((r.minMinutes / 60) * 10) / 10 })
          : null,
        r.kind === "request" && r.minDays != null ? t("approvals.rules.whenDays", { count: r.minDays }) : null,
        r.kind === "expense" && r.minAmountCents != null
          ? t("approvals.rules.whenAmount", { amount: formatMoney(r.minAmountCents, currency, dateLocale()) })
          : null,
        r.whenCoverShort ? t("approvals.rules.whenCover") : null,
      ]
        .filter(Boolean)
        .join(", ") || t("approvals.rules.always")
    const head = t("approvals.rules.head", {
      what: t(`approvals.rules.kind.${r.kind}`),
      when,
      where: r.spaceName ?? t("approvals.rules.everywhere"),
    })
    const parts = [
      r.secondRoleId ? t("approvals.rules.needs", { role: r.secondRoleName ?? "?" }) : null,
      r.remindAfterHours != null ? t("approvals.rules.reminds", { hours: r.remindAfterHours }) : null,
      r.escalateAfterHours != null
        ? t("approvals.rules.escalates", { hours: r.escalateAfterHours, role: r.escalateRoleName ?? "?" })
        : null,
    ].filter(Boolean)
    return `${head} ${parts.join(" ")}`
  }

  const ready = roleId !== NONE || remind.trim() !== "" || (escalate.trim() !== "" && escalateRoleId !== NONE)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-xl">
        <DialogHeader>
          <DialogTitle>{t("approvals.rules.title")}</DialogTitle>
          <DialogDescription>{t("approvals.rules.intro")}</DialogDescription>
        </DialogHeader>

        <ul className="divide-y divide-border rounded-lg border border-border">
          {(rules ?? []).map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <p className={r.isActive ? "flex-1 text-foreground" : "flex-1 text-muted-foreground line-through"}>
                {describe(r)}
              </p>
              <Switch
                checked={r.isActive}
                disabled={toggle.isPending}
                onCheckedChange={() => toggle.mutate(r)}
                aria-label={t("approvals.rules.active")}
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={remove.isPending}
                onClick={() => remove.mutate(r.id)}
                aria-label={t("approvals.rules.remove")}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
          {rules && !rules.length && (
            <li className="px-3 py-3 text-sm text-muted-foreground">{t("approvals.rules.none")}</li>
          )}
        </ul>

        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-sm font-medium text-foreground">{t("approvals.rules.add")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("approvals.rules.kindLabel")}</Label>
              <Select
                value={kind}
                onValueChange={(v) => {
                  setKind(v as RuleKind)
                  setThreshold("")
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {t(`approvals.rules.kind.${k}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("approvals.rules.where")}</Label>
              <Select value={spaceId} onValueChange={setSpaceId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("approvals.rules.everywhere")}</SelectItem>
                  {(spaces ?? [])
                    .filter((s) => s.isActive !== false)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-threshold">{t(`approvals.rules.threshold.${kind}`, { currency })}</Label>
              <Input
                id="rule-threshold"
                type="number"
                inputMode="decimal"
                min={0}
                step={kind === "request" ? 1 : 0.5}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder={t("approvals.rules.thresholdHint")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("approvals.rules.secondRole")}</Label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("approvals.rules.noSecond")}</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {kind === "request" && (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox checked={coverShort} onCheckedChange={(v) => setCoverShort(v === true)} />
              {t("approvals.rules.coverLabel")}
            </label>
          )}
          <p className="pt-1 text-sm font-medium text-foreground">{t("approvals.rules.noAnswer")}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="rule-remind">{t("approvals.rules.remindAfter")}</Label>
              <Input
                id="rule-remind"
                type="number"
                min={1}
                max={720}
                value={remind}
                onChange={(e) => setRemind(e.target.value)}
                placeholder="—"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-escalate">{t("approvals.rules.escalateAfter")}</Label>
              <Input
                id="rule-escalate"
                type="number"
                min={1}
                max={720}
                value={escalate}
                onChange={(e) => setEscalate(e.target.value)}
                placeholder="—"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("approvals.rules.escalateTo")}</Label>
              <Select value={escalateRoleId} onValueChange={setEscalateRoleId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("approvals.rules.noAnswerHint")}</p>
          <Button className="w-full rounded-lg" disabled={!ready || save.isPending} onClick={() => save.mutate()}>
            {t("approvals.rules.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
