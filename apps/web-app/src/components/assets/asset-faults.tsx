"use client"

import { useTranslation } from "react-i18next"
import { Plus, Search } from "lucide-react"

import { type KindList, type KindShape } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useAssetFaults } from "./use-asset-faults"
import { FaultForm } from "./fault-form"
import { FaultCard } from "./fault-card"
import { EmptyNote } from "@/components/ui/empty-note"

/**
 * The fault-code lookup a technician standing at the machine actually uses.
 *
 * A raw table of codes is a list of numbers. What answers the question is:
 * the code, what it means, why it happens, what to do about it — and which part
 * that needs, resolved out of the same kind's catalogue so the technician does
 * not have to go and find it.
 *
 * Modelled on how maintenance systems structure this (code / meaning / cause /
 * remedy, with a safety note), and kept on the KIND because the library belongs
 * to the equipment class, not to one machine.
 */
export function AssetFaults({
  assetId,
  assetName,
  spaceId,
  list,
  shape,
}: {
  assetId: string
  assetName: string
  /** The space this asset's type belongs to, so a raised job lands there. */
  spaceId?: string | null
  list: KindList
  /** The whole kind, so a link column can find the table it points at. */
  shape: KindShape
}) {
  const {
    search,
    setSearch,
    editing,
    setEditing,
    faultsQ,
    partsQ,
    catalogueTruncated,
    linkCol,
    codeCol,
    parts,
    partByCode,
    col,
    pick,
    rows,
    refresh,
    remove,
    partOptions,
  } = useAssetFaults({ assetId, list, shape })
  const { t } = useTranslation()

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("assetFaults.search", "Search a code or a symptom…")}
            className="h-9 pl-8"
          />
        </div>
        <Button size="sm" onClick={() => setEditing(editing === "new" ? null : "new")}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> {t("assetFaults.add", "Add a code")}
        </Button>
      </div>

      {list.shared && (
        <p className="text-[11px] text-muted-foreground">
          {t(
            "assetFaults.sharedNote",
            "This library belongs to the kind — every one of them reads it, and a " + "change here changes it for all.",
          )}
        </p>
      )}

      {editing === "new" && (
        <FaultForm
          assetId={assetId}
          list={list}
          partOptions={partOptions}
          linkCol={linkCol}
          onDone={() => {
            setEditing(null)
            refresh()
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {faultsQ.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyNote>
          {search ? t("assetLists.noMatch", "Nothing matches that") : t("assetFaults.empty", "No fault codes yet")}
        </EmptyNote>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const code = pick(row, ["code"])
            const meaning = pick(row, ["meaning", "title"])
            const cause = pick(row, ["cause"])
            const fix = pick(row, ["fix", "remedy", "solution"])
            const safety = pick(row, ["safety"])
            const partCode = linkCol ? col(row, linkCol) : ""
            const part = partCode ? partByCode.get(partCode.toLowerCase()) : undefined

            if (editing === row.id) {
              return (
                <FaultForm
                  key={row.id}
                  assetId={assetId}
                  list={list}
                  existing={row}
                  partOptions={partOptions}
                  linkCol={linkCol}
                  onDone={() => {
                    setEditing(null)
                    refresh()
                  }}
                  onCancel={() => setEditing(null)}
                />
              )
            }

            return (
              <FaultCard
                key={row.id}
                assetId={assetId}
                assetName={assetName}
                spaceId={spaceId}
                code={code}
                meaning={meaning}
                cause={cause}
                fix={fix}
                safety={safety}
                partCode={partCode}
                part={part}
                parts={parts}
                codeCol={codeCol}
                catalogueTruncated={catalogueTruncated}
                partsFetched={partsQ.data?.rows.length ?? 0}
                onEdit={() => setEditing(row.id)}
                onRemove={() => remove.mutate(row.id)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
