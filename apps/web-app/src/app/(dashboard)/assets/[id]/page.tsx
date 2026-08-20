"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft, Ban, Clock, Loader2, MapPin, Package, Plus, User,
} from "lucide-react"

import { assetsApi, organizationsApi, tasksApi, type AssetActivity, type AssetCategory } from "@/lib/api"
import {
  normalizeKindShape, detailRowsForKind, kindHolderLabel,
} from "@hbcfield/shared/client"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * One thing you own — its details, who has it, what happened to it.
 *
 * The same page an apartment gets, except every part is drawn from the KIND:
 * the address block appears only if the kind has one, the holder is called
 * whatever that kind calls it, and the details are its fields.
 */

const DONE = ["COMPLETED", "CLOSED", "CANCELED"]

export default function AssetRecordPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id ?? ""
  const qc = useQueryClient()
  const [tab, setTab] = useState<"activity" | "history">("activity")

  const assetQ = useQuery({ queryKey: ["asset", id], queryFn: () => assetsApi.getAsset(id), enabled: !!id })
  const asset = assetQ.data as
    | (Record<string, unknown> & { name: string; category?: AssetCategory })
    | undefined

  const actQ = useQuery({
    queryKey: ["asset-activities", id],
    queryFn: () => assetsApi.getActivities(id),
    enabled: !!asset,
  })
  const tasksQ = useQuery({
    queryKey: ["asset-tasks", id],
    queryFn: () => assetsApi.getAssetHistory(id),
    enabled: !!asset,
  })
  const membersQ = useQuery({
    queryKey: ["org-members-assignable"],
    queryFn: () => organizationsApi.getMembers({ limit: 100 }),
    enabled: !!asset?.holderUserId,
  })

  if (assetQ.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }
  if (!asset) {
    return (
      <div className="mx-auto max-w-5xl p-6 text-center text-muted-foreground">
        {t("assetRecords.notFound", "Not found")}
      </div>
    )
  }

  const kind = asset.category as AssetCategory | undefined
  const shape = normalizeKindShape(kind?.config)
  const rows = detailRowsForKind(shape, asset.details).filter((r) => r.value)
  const holderName = (() => {
    if (asset.holderUserId) {
      const m = (membersQ.data?.data ?? []).find((x) => x.id === asset.holderUserId)
      return m ? `${m.firstName} ${m.lastName}`.trim() : t("assetRecords.someone", "A member")
    }
    return null
  })()

  const tasks = ((tasksQ.data as unknown as { data?: unknown[] })?.data ?? []) as Record<string, unknown>[]
  const openCount = tasks.filter((tk) => !DONE.includes(String(tk.status))).length

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {kind?.name ?? t("assetKinds.title", "Assets")}
      </button>

      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
            <Package className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {asset.name as string}
            </h1>
            {shape.hasAddress && asset.locationAddress ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> {asset.locationAddress as string}
              </p>
            ) : null}
          </div>
          {shape.holder.enabled && (
            <div className="shrink-0 text-right">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {kindHolderLabel(shape, t("assetRecords.holder", "Held by"))}
              </p>
              {holderName || asset.customerId ? (
                <Badge variant="secondary" className="mt-1 gap-1">
                  <User className="h-3 w-3" /> {holderName ?? t("assetRecords.aClient", "A client")}
                </Badge>
              ) : (
                <Badge variant="outline" className="mt-1 gap-1 text-muted-foreground">
                  <Ban className="h-3 w-3" /> {t("assetRecords.free", "Free")}
                </Badge>
              )}
            </div>
          )}
        </div>

        {rows.length > 0 && (
          <div className="mt-4 grid gap-x-6 gap-y-3 border-t border-border pt-4 sm:grid-cols-3">
            {rows.map((r) => (
              <div key={r.label} className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{r.label}</p>
                <p className="truncate text-sm text-foreground">{r.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity + History */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-1 border-b border-border p-1">
          {([
            ["activity", t("apartments.activity", "Activity"), (actQ.data ?? []).length],
            ["history", t("apartments.history", "History"), openCount || null],
          ] as const).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tab === key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              {count ? <span className="text-xs text-muted-foreground">{count}</span> : null}
            </button>
          ))}
        </div>

        {tab === "activity" ? (
          <div className="p-4">
            <NoteBox assetId={id} onAdded={() => qc.invalidateQueries({ queryKey: ["asset-activities", id] })} />
            <Timeline loading={actQ.isLoading} activities={actQ.data ?? []} />
          </div>
        ) : (
          <div className="p-4">
            {tasksQ.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : tasks.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("assetRecords.noHistory", "No tasks for this yet.")}
              </p>
            ) : (
              <div className="space-y-2">
                {tasks.map((tk) => (
                  <div key={String(tk.id)} className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{String(tk.title ?? "")}</span>
                    <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
                      {String(tk.status ?? "")}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Write a note against this thing. */
function NoteBox({ assetId, onAdded }: { assetId: string; onAdded: () => void }) {
  const { t } = useTranslation()
  const [body, setBody] = useState("")

  const add = useMutation({
    mutationFn: () => assetsApi.addActivity(assetId, body.trim()),
    onSuccess: () => {
      setBody("")
      onAdded()
    },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <div className="mb-4 flex items-center gap-2">
      <Input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // Enter posts, so a one-line note does not need a trip to the button.
          if (e.key === "Enter" && body.trim() && !add.isPending) add.mutate()
        }}
        placeholder={t("assetRecords.notePh", "Add a note — inspection, damage, handover…")}
      />
      <Button disabled={!body.trim() || add.isPending} onClick={() => add.mutate()}>
        {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1 h-3.5 w-3.5" /> {t("apartments.addNote", "Add note")}</>}
      </Button>
    </div>
  )
}

/** What happened, newest first. */
function Timeline({ loading, activities }: { loading: boolean; activities: AssetActivity[] }) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
      </div>
    )
  }
  if (activities.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{t("apartments.noActivity", "No activity yet.")}</p>
  }

  return (
    <div className="space-y-2">
      {activities.map((a) => {
        const author = a.author
          ? `${a.author.firstName} ${a.author.lastName ?? ""}`.trim()
          : t("customers.system", "System")
        return (
          <div key={a.id} className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {a.type === "HOLDER_CHANGED"
                  ? t("assetRecords.handedOver", "Changed hands")
                  : t("apartments.note", "Note")}
              </span>
              <span>·</span>
              <span>{author}</span>
              <span>·</span>
              <span>{new Date(a.createdAt).toLocaleString()}</span>
            </div>
            {a.body && <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{a.body}</p>}
          </div>
        )
      })}
    </div>
  )
}
