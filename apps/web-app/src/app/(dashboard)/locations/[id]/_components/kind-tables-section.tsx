"use client"

import { useTranslation } from "react-i18next"
import { ChoiceChip } from "@/components/ui/choice-chip"
import { Plus, Table2, Trash2 } from "lucide-react"
import {
  KIND_SHAPE_LIMITS,
  keyColumn,
  linkTargets,
  type KindColumn,
  type KindColumnType,
  type KindShape,
} from "@hbcfield/shared/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * Tables. A field answers "what is this one's floor"; a list answers "what is in it" — a machine's parts,
 * an apartment's keys — which needs rows, not a value. Each table has typed columns and is either the
 * same on every record or filled in per record.
 */
export function KindTablesSection({
  shape,
  setShape,
}: {
  /** The whole shape: a link column may point at any other table of the kind. */
  shape: KindShape
  setShape: React.Dispatch<React.SetStateAction<KindShape>>
}) {
  const { t } = useTranslation()
  const set = <K extends keyof KindShape>(k: K, v: KindShape[K]) => setShape((s) => ({ ...s, [k]: v }))
  const setList = (
    i: number,
    patch: { label?: string; columns?: KindColumn[]; display?: "table" | "cards"; shared?: boolean },
  ) => setShape((s) => ({ ...s, lists: s.lists.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }))
  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Table2 className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">{t("assetKinds.lists", "Tables on each one")}</p>
            <p className="text-[11px] text-muted-foreground">
              {t("assetKinds.listsHint", "A parts catalogue, a set of keys — a table with as many rows as it needs.")}
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={shape.lists.length >= KIND_SHAPE_LIMITS.maxLists}
          onClick={() =>
            set("lists", [
              ...shape.lists,
              { label: "", columns: [{ label: "", type: "text" as const }], display: "table" as const, shared: false },
            ])
          }
          className={
            "shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary " +
            "hover:underline disabled:opacity-40 disabled:no-underline"
          }
        >
          <Plus className="h-3.5 w-3.5" /> {t("common.add", "Add")}
        </button>
      </div>

      {shape.lists.map((list, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border/70 p-2.5">
          <div className="flex items-center gap-2">
            <Input
              value={list.label}
              onChange={(e) => setList(i, { label: e.target.value })}
              placeholder={t("assetKinds.listName", "Parts")}
              maxLength={KIND_SHAPE_LIMITS.maxLabel}
            />
            {/* How the rows read. A display choice — nothing about what
                the table MEANS, which the columns decide. */}
            <select
              value={list.display}
              onChange={(e) => setList(i, { display: e.target.value as "table" | "cards" })}
              className="h-9 shrink-0 rounded-md border border-border bg-background px-2 text-sm text-foreground"
            >
              <option value="table">{t("assetKinds.displayTable", "As a grid")}</option>
              <option value="cards">{t("assetKinds.displayCards", "As cards")}</option>
            </select>
            <button
              type="button"
              onClick={() =>
                set(
                  "lists",
                  shape.lists.filter((_, idx) => idx !== i),
                )
              }
              className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-destructive"
              aria-label={t("common.remove", "Remove")}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {/* Typed once for the kind, or filled in per record. A parts
              catalogue is the same on every machine of a model; a set of
              keys belongs to one flat. */}
          <div className="flex gap-2 pl-1">
            <OwnerBtn
              active={list.shared}
              onClick={() => setList(i, { shared: true })}
              label={t("assetKinds.sharedOn", "Same for every one")}
            />
            <OwnerBtn
              active={!list.shared}
              onClick={() => setList(i, { shared: false })}
              label={t("assetKinds.sharedOff", "Different on each")}
            />
          </div>

          <div className="pl-1">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] text-muted-foreground">
                {t("assetKinds.listColumns", "Columns in this table")}
              </Label>
              <button
                type="button"
                disabled={list.columns.length >= KIND_SHAPE_LIMITS.maxColumns}
                onClick={() => setList(i, { columns: [...list.columns, { label: "", type: "text" as const }] })}
                className={
                  "inline-flex items-center gap-1 text-[11px] font-medium text-primary " +
                  "hover:underline disabled:opacity-40 disabled:no-underline"
                }
              >
                <Plus className="h-3 w-3" /> {t("common.add", "Add")}
              </button>
            </div>
            <div className="mt-1.5 space-y-1.5">
              {list.columns.map((col, ci) => {
                const setCol = (patch: Partial<KindColumn>) =>
                  setList(i, {
                    columns: list.columns.map((c, idx) => (idx === ci ? { ...c, ...patch } : c)) as KindColumn[],
                  })
                const targets = linkTargets(shape, list)
                return (
                  <div key={ci} className="flex items-center gap-1.5">
                    <Input
                      value={col.label}
                      onChange={(e) => setCol({ label: e.target.value })}
                      placeholder={t("assetKinds.listColumn", "Code")}
                      className="h-8 flex-1"
                      maxLength={KIND_SHAPE_LIMITS.maxLabel}
                    />
                    {/* What the column IS. A key makes rows of this table
                        referenceable; a link points at another table's
                        keys and is picked, not typed. */}
                    <select
                      value={col.type}
                      onChange={(e) => {
                        const type = e.target.value as KindColumnType
                        setCol({
                          type,
                          linkTo: type === "link" ? (col.linkTo ?? targets[0]?.label) : undefined,
                        })
                      }}
                      className="h-8 shrink-0 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
                    >
                      <option value="text">{t("assetKinds.colText", "Plain text")}</option>
                      <option value="key">{t("assetKinds.colKey", "Code (identifies the row)")}</option>
                      <option value="link" disabled={targets.length === 0}>
                        {t("assetKinds.colLink", "Points at another table")}
                      </option>
                    </select>
                    {col.type === "link" && (
                      <select
                        value={col.linkTo ?? ""}
                        onChange={(e) => setCol({ linkTo: e.target.value })}
                        className="h-8 shrink-0 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
                      >
                        {targets.map((tl) => (
                          <option key={tl.label} value={tl.label}>
                            {tl.label}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => setList(i, { columns: list.columns.filter((_, idx) => idx !== ci) })}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                      aria-label={t("common.remove", "Remove")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
            {!keyColumn(list) && (
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                {t("assetKinds.noKeyHint", "No column marked as the code — other tables cannot point at this one.")}
              </p>
            )}
            {list.columns.filter((c) => c.label.trim()).length === 0 && (
              <p className="mt-1 text-[11px] text-destructive">
                {t("assetKinds.listNeedsColumn", "A table needs at least one column, or it is dropped.")}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Typed once for the kind, or filled in per record. */
function OwnerBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <ChoiceChip type="button" on={active} onClick={onClick}>
      {label}
    </ChoiceChip>
  )
}
