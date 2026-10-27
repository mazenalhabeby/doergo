"use client"

import { useTranslation } from "react-i18next"
import type { ApprovalRuleInput, ApprovalRuleView } from "@hbcfield/shared/client"
import { Icon } from "@/components/ui/icon"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { RuleRange } from "../../_lib/rule-range"
import type { RuleRole } from "../../_hooks/use-rules-tree"
import { useConfirmPress } from "../../_hooks/use-confirm-press"
import { ChoiceSelect, DoneNode, FlowNode, NONE } from "./tree-nodes"
import { WhenNode } from "./when-node"

const HOURS = [4, 24, 48, 72]
/**
 * The bin shows when the row is pointed at or focused (always on a touch screen, which cannot point), and deletes
 * only on a SECOND press — a rule is never lost to one stray tap.
 */
const BIN =
  "grid h-8 min-w-8 place-items-center rounded-lg px-1.5 text-muted-foreground opacity-0 transition-opacity " +
  "hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 " +
  "[@media(hover:none)]:opacity-100"

type RemoveProps = { label: string; confirmLabel: string; busy?: boolean; onRemove: () => void }
function RemoveButton({ label, confirmLabel, busy, onRemove }: RemoveProps) {
  const { t } = useTranslation()
  const { asking, press } = useConfirmPress(onRemove)
  return (
    <button
      type="button"
      onClick={press}
      disabled={busy}
      aria-label={asking ? confirmLabel : label}
      className={cn(
        BIN,
        "disabled:pointer-events-none disabled:opacity-50",
        asking && "bg-shell-crit/10 text-[12px] font-semibold text-shell-crit opacity-100",
      )}
    >
      {asking ? t("approvals.tree.confirmRemove") : <Icon name="trash" size={15} />}
    </button>
  )
}

export type RulePartName = "head" | "where" | "when" | "also" | "chase" | "done"

/**
 * One piece of a rule's chain, as a node of the canvas: its head (number, on/off, delete), where, when
 * (the range it really covers), who also approves, what happens when nobody answers, and where it ends.
 * Every piece reads the same rule, so they cannot disagree.
 */
export function RulePart({
  part,
  rule,
  n,
  roles,
  workspaces,
  currency,
  range,
  hits,
  everywhere = true,
  removing,
  onChange,
  onRemove,
}: {
  part: RulePartName
  rule: ApprovalRuleView
  n: number
  roles: RuleRole[]
  workspaces: { id: string; name: string }[]
  currency: string
  range: RuleRange
  hits?: number
  /** May this caller set a rule for every workspace (not when they manage rules in some only)? */
  everywhere?: boolean
  /** Its delete is in flight. */
  removing?: boolean
  onChange: (patch: Partial<ApprovalRuleInput>) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()

  const roleOf = (id: string | null) => roles.find((r) => r.id === id)
  // "Nobody holds it" only when the role list is known — never while it loads or for a role it does not list.
  const nobody = (id: string | null) => roleOf(id)?.holders === 0
  // A role the rule names but the list does not (yet): still a choice, so the picker shows it.
  const missing = [
    [rule.secondRoleId, rule.secondRoleName],
    [rule.escalateRoleId, rule.escalateRoleName],
  ]
    .flatMap(([id, name]) => (id && !roleOf(id) ? [{ value: id, label: name ?? "—" }] : []))
    .filter((c, i, list) => list.findIndex((o) => o.value === c.value) === i)
  // A role nobody holding it may approve this kind with is shown, never chosen (the server refuses it too).
  const roleChoices = [
    ...roles.map((r) => {
      const name = r.inSpace ? t("approvals.tree.inThatWorkspace", { role: r.name }) : r.name
      const can = r.decides.includes(rule.kind)
      return { value: r.id, label: can ? name : t("approvals.tree.cannotApprove", { role: name }), disabled: !can }
    }),
    ...missing,
  ]
  const wait = (h: number) =>
    h % 24 ? t("approvals.tree.hours", { count: h }) : t("approvals.tree.days", { count: h / 24 })
  // The usual waits, plus whatever this rule already has (set elsewhere, or before the list changed).
  const hourChoices = [...new Set([...HOURS, rule.remindAfterHours, rule.escalateAfterHours])]
    .filter((h): h is number => h != null)
    .sort((a, b) => a - b)
    .map((h) => ({ value: String(h), label: wait(h) }))
  // Named by the list, else by the rule itself (the list may still be loading).
  const named = (id: string | null, name: string | null | undefined) =>
    roleOf(id) ?? (id && name ? { id, name, inSpace: false, holders: -1, decides: [] } : undefined)
  const second = named(rule.secondRoleId, rule.secondRoleName)
  const pass = named(rule.escalateRoleId, rule.escalateRoleName)
  const chase = [
    rule.remindAfterHours != null ? t("approvals.tree.chase.remind", { after: wait(rule.remindAfterHours) }) : null,
    pass ? t("approvals.tree.chase.pass", { role: pass.name, after: wait(rule.escalateAfterHours ?? 48) }) : null,
  ].filter(Boolean)

  // Switched off: faded, never so far that the words lose their contrast — the head says "Off" in words.
  const dim = !rule.isActive && "opacity-70"
  // Each rule's own switch and bin say which rule they are about, for a screen reader.
  const ruleName = t("approvals.tree.rule", { n })
  const activeLabel = t("approvals.rules.active")
  const removeLabel = t("approvals.rules.remove")
  // An every-workspace rule shown to a manager of some workspaces: read, never changed (the server refuses it too).
  const readOnly = rule.editable === false
  switch (part) {
    case "head":
      return (
        // The head stays at full strength: its switch and "Off" are how a switched-off rule is turned back on.
        <div className="group/row">
          <div className="flex h-7 items-center gap-2">
            <span className="text-[12.5px] font-semibold text-muted-foreground">{t("approvals.tree.rule", { n })}</span>
            {readOnly ? (
              <span className="text-[11.5px] text-muted-foreground">{t("approvals.tree.readOnly")}</span>
            ) : (
              <>
                <Switch
                  checked={rule.isActive}
                  onCheckedChange={(v) => onChange({ isActive: v })}
                  aria-label={`${activeLabel} · ${ruleName}`}
                  className="scale-90"
                />
                <RemoveButton
                  label={`${removeLabel} · ${ruleName}`}
                  confirmLabel={t("approvals.tree.confirmRemoveLabel", { rule: ruleName })}
                  busy={removing}
                  onRemove={onRemove}
                />
              </>
            )}
            {!rule.isActive && (
              <span className="rounded-full border border-border px-2 py-0.5 text-[11.5px] font-semibold text-foreground">
                {t("approvals.tree.ruleOff")}
              </span>
            )}
            {hits != null && (
              <span className="rounded-full bg-shell-chip px-2 py-0.5 text-[11.5px] font-semibold text-muted-foreground">
                {t("approvals.tree.smart.hits", { count: hits })}
              </span>
            )}
          </div>
        </div>
      )
    case "where":
      return (
        <div className={cn(dim)}>
          <FlowNode
            readOnly={readOnly}
            icon="workspaces"
            label={t("approvals.tree.node.where")}
            value={
              rule.spaceId
                ? // An archived workspace is not in the list: its name comes with the rule.
                  (workspaces.find((w) => w.id === rule.spaceId)?.name ?? rule.spaceName ?? "—")
                : t("approvals.rules.everywhere")
            }
            sub={
              range.alsoWith.length
                ? t("approvals.tree.range.alsoWith", {
                    count: range.alsoWith.length,
                    numbers: range.alsoWith.join(", "),
                  })
                : undefined
            }
          >
            <ChoiceSelect
              value={rule.spaceId ?? NONE}
              onChange={(v) => onChange({ spaceId: v === NONE ? null : v })}
              label={t("approvals.rules.where")}
              choices={[
                // Every workspace only for a caller who manages rules everywhere (the server refuses it otherwise).
                ...(everywhere || !rule.spaceId ? [{ value: NONE, label: t("approvals.rules.everywhere") }] : []),
                ...workspaces.map((w) => ({ value: w.id, label: w.name })),
                ...(rule.spaceId && !workspaces.some((w) => w.id === rule.spaceId)
                  ? [{ value: rule.spaceId, label: rule.spaceName ?? "—" }]
                  : []),
              ]}
            />
          </FlowNode>
        </div>
      )
    case "when":
      return (
        <div className={cn(dim)}>
          <WhenNode rule={rule} range={range} currency={currency} onChange={onChange} />
        </div>
      )
    case "also":
      return (
        <div className={cn(dim)}>
          <FlowNode
            readOnly={readOnly}
            icon="userLine"
            label={t("approvals.tree.node.also")}
            value={second?.name ?? t("approvals.tree.nobody")}
            bad={nobody(rule.secondRoleId)}
            sub={
              !second
                ? t("approvals.tree.onlyFirst")
                : second.holders > 0
                  ? t("approvals.tree.holders", { count: second.holders })
                  : second.holders === 0
                    ? t("approvals.tree.nobodyHolds")
                    : undefined
            }
          >
            <ChoiceSelect
              value={rule.secondRoleId ?? NONE}
              onChange={(v) => onChange({ secondRoleId: v === NONE ? null : v })}
              label={t("approvals.tree.alsoBy")}
              choices={[{ value: NONE, label: t("approvals.tree.nobodySecond") }, ...roleChoices]}
            />
          </FlowNode>
        </div>
      )
    case "chase":
      return (
        <div className={cn(dim)}>
          <FlowNode
            readOnly={readOnly}
            icon="alarm"
            label={t("approvals.tree.node.chase")}
            value={chase.length ? chase[0] : t("approvals.tree.chase.off")}
            sub={chase[1] ?? undefined}
            bad={nobody(rule.escalateRoleId)}
          >
            <span className="text-[13px] text-muted-foreground">{t("approvals.tree.remindAfter")}</span>
            <ChoiceSelect
              value={rule.remindAfterHours != null ? String(rule.remindAfterHours) : NONE}
              onChange={(v) => onChange({ remindAfterHours: v === NONE ? null : Number(v) })}
              label={t("approvals.tree.remindAfter")}
              choices={[{ value: NONE, label: "—" }, ...hourChoices]}
            />
            <span className="text-[13px] text-muted-foreground">{t("approvals.tree.passTo")}</span>
            <ChoiceSelect
              value={rule.escalateRoleId ?? NONE}
              onChange={(v) =>
                onChange(
                  v === NONE
                    ? { escalateRoleId: null, escalateAfterHours: null }
                    : { escalateRoleId: v, escalateAfterHours: rule.escalateAfterHours ?? 48 },
                )
              }
              label={t("approvals.tree.passTo")}
              choices={[{ value: NONE, label: t("approvals.tree.nobody") }, ...roleChoices]}
              bad={nobody(rule.escalateRoleId)}
            />
            {rule.escalateRoleId && (
              <ChoiceSelect
                value={String(rule.escalateAfterHours ?? 48)}
                onChange={(v) => onChange({ escalateAfterHours: Number(v) })}
                label={t("approvals.tree.after")}
                choices={hourChoices}
              />
            )}
          </FlowNode>
        </div>
      )
    case "done":
      return (
        <div className={cn(dim)}>
          <DoneNode>
            {!rule.secondRoleId
              ? t("approvals.tree.doneOne")
              : range.alsoWith.length
                ? t("approvals.tree.doneMore", { count: 2 })
                : t("approvals.tree.doneTwo")}
          </DoneNode>
        </div>
      )
  }
}
