"use client"

import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { Building2 } from "lucide-react"
import { keys } from "@/lib/query-keys"
import { assetsApi, type AssetCategory, type CompanyLocation } from "@/lib/api"
import { fieldsDroppedByMove } from "@hbcfield/shared/client"

/**
 * Moving a record to another workspace: choosing the kind it becomes there, and naming the fields that
 * kind does not have before anybody agrees to lose them.
 */
export function AssetMoveSection({
  open,
  spaceId,
  kind,
  details,
  spaces,
  moving,
  setMoving,
  destSpace,
  setDestSpace,
  destKind,
  setDestKind,
}: {
  open: boolean
  spaceId: string
  kind: AssetCategory
  details: unknown
  spaces: CompanyLocation[]
  moving: boolean
  setMoving: (moving: boolean) => void
  destSpace: string
  setDestSpace: (id: string) => void
  destKind: string
  setDestKind: (id: string) => void
}) {
  const { t } = useTranslation()
  const destKindsQ = useQuery({
    queryKey: keys.assets.categories(destSpace),
    queryFn: () => assetsApi.getCategories(destSpace),
    enabled: open && moving && !!destSpace,
  })
  const destKinds = ((destKindsQ.data ?? []) as AssetCategory[]).filter((k) => k.id !== kind.id)
  const chosenKind = destKinds.find((k) => k.id === destKind)

  /*
    What the move throws away, named before anybody agrees to it.

    The same function the server uses to decide what to keep, read the other way
    round — so the sentence on screen and the rows actually deleted cannot
    disagree.
  */
  const dropped = chosenKind ? fieldsDroppedByMove(details, chosenKind.config) : []

  return (
    <div className="mt-3 border-t border-border pt-3">
      {!moving ? (
        <button
          type="button"
          onClick={() => setMoving(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Building2 className="h-3.5 w-3.5" />
          {t("assetRecords.move", "Move to another workspace")}
        </button>
      ) : (
        <div className="space-y-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-xs font-semibold">{t("assetRecords.moveTitle", "Move to another workspace")}</p>

          <div className="grid gap-2 sm:grid-cols-2">
            <select
              value={destSpace}
              onChange={(e) => {
                setDestSpace(e.target.value)
                setDestKind("")
              }}
              className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
            >
              <option value="">{t("assetRecords.moveSpace", "Workspace…")}</option>
              {spaces
                .filter((sp) => sp.id !== spaceId)
                .map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name}
                  </option>
                ))}
            </select>
            {/*
                    The kind, not just the workspace: the record has to become
                    something when it arrives, and the kind is what it becomes.
                  */}
            <select
              value={destKind}
              onChange={(e) => setDestKind(e.target.value)}
              disabled={!destSpace || destKindsQ.isLoading}
              className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm disabled:opacity-50"
            >
              <option value="">{t("assetRecords.moveKind", "Kind…")}</option>
              {destKinds.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </div>

          {destSpace && !destKindsQ.isLoading && destKinds.length === 0 && (
            <p className="text-[11.5px] text-muted-foreground">
              {t("assetRecords.moveNoKinds", "That workspace has no asset kinds yet.")}
            </p>
          )}

          {/* Named, one by one. A count would not tell anybody whether the
                    thing they care about is in it. */}
          {dropped.length > 0 && (
            <p className="text-[11.5px] leading-relaxed text-amber-700 dark:text-amber-400">
              {t("assetRecords.moveDrops", "{{kind}} does not have these fields, and they will be deleted:", {
                kind: chosenKind?.name ?? "",
              })}{" "}
              <b>{dropped.join(", ")}</b>
            </p>
          )}
          {chosenKind && dropped.length === 0 && (
            <p className="text-[11.5px] text-muted-foreground">
              {t("assetRecords.moveKeeps", "Every field on this record exists in {{kind}} — nothing is lost.", {
                kind: chosenKind.name,
              })}
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              setMoving(false)
              setDestSpace("")
              setDestKind("")
            }}
            className="text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
          >
            {t("common.cancel", "Cancel")}
          </button>
        </div>
      )}
    </div>
  )
}
