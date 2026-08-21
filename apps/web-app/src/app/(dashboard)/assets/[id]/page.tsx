"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useParams, useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft, Clock, ListChecks, Loader2, Mail, MapPin, Package, Phone, Plus, Settings2, Smartphone, Trash2, UserCheck,
} from "lucide-react"

import {
  assetsApi,
  type AssetActivity, type AssetCategory, type AssetMoneyEntry, type MaintenanceHistoryItem,
} from "@/lib/api"
import {
  normalizeKindShape, detailRowsForKind, kindHolderLabel, formatCents,
  type KindShape,
} from "@hbcfield/shared/client"
import { AssetRecordDialog } from "@/components/assets/asset-record-dialog"
import { AssetListTable } from "@/components/assets/asset-list-table"
import { AssetFaults } from "@/components/assets/asset-faults"
import { AssetStructure } from "@/components/assets/asset-structure"
import { AssetRaiseJob } from "@/components/assets/asset-raise-job"
import { AssetInviteClient } from "@/components/assets/asset-invite-client"
import { notify } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

const AddressMap = dynamic(() => import("../../customers/[id]/address-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-muted" />,
}) as unknown as React.ComponentType<{ lat: number | null; lng: number | null }>

/**
 * One thing you own — the page an apartment gets, drawn from its KIND.
 *
 * Same layout as an apartment: the map, who has it and what you record about it
 * down the left; what happened to it on the right. Every part appears because
 * the kind asked for it, so a van with no address simply has no map.
 */

const DONE = ["COMPLETED", "CLOSED", "CANCELED"]
const initials = (a?: string, b?: string) => `${a?.[0] ?? ""}${b?.[0] ?? ""}`.toUpperCase() || "?"

interface AssetDetail {
  id: string
  name: string
  locationAddress?: string | null
  locationLat?: number | null
  locationLng?: number | null
  holderUserId?: string | null
  /** Everyone who holds it. One entry, or several when the type allows it. */
  holders?: Array<{
    id: string
    userId?: string | null
    customerId?: string | null
    user?: { id: string; firstName: string; lastName: string; email?: string | null } | null
    customer?: { id: string; name: string; email?: string | null; phone?: string | null } | null
  }>
  customer?: { id: string; name: string; email?: string | null; phone?: string | null } | null
  details?: unknown
  category?: AssetCategory | null
}

export default function AssetRecordPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id ?? ""
  const qc = useQueryClient()
  // A list tab is keyed by its own name, so adding a list adds a tab.
  const [tab, setTab] = useState<string>("activity")

  const assetQ = useQuery({ queryKey: ["asset", id], queryFn: () => assetsApi.getAsset(id), enabled: !!id })
  const asset = assetQ.data as unknown as AssetDetail | undefined

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
  const moneyQ = useQuery({
    queryKey: ["asset-money", id],
    queryFn: () => assetsApi.getMoney(id),
    // Only when the kind tracks money — otherwise this asks for a ledger that
    // will always be empty on every open.
    enabled: !!asset && normalizeKindShape(asset?.category?.config).money.enabled,
  })

  if (assetQ.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }
  if (!asset) {
    return (
      <div className="mx-auto max-w-6xl p-6 text-center text-muted-foreground">
        {t("assetRecords.notFound", "Not found")}
      </div>
    )
  }

  const kind = asset.category ?? undefined
  const shape = normalizeKindShape(kind?.config)

  // The list this record came from: its type, inside its space's Assets tab.
  // Falls back to the spaces list for an asset whose type was deleted out from
  // under it — an orphan, which has no list to go back to.
  const backHref = kind?.spaceId
    ? `/locations/${kind.spaceId}?tab=assets&type=${kind.id}`
    : "/locations"
  const rows = detailRowsForKind(shape, asset.details).filter((r) => r.value)
  const holders = asset.holders ?? []
  const hasMap = shape.hasAddress && asset.locationLat != null && asset.locationLng != null

  // getAssetHistory already unwraps the envelope, so this IS the array. Reaching
  // for .data on it "defensively" is what made the tab read empty while the API
  // was returning the job perfectly well.
  const tasks: MaintenanceHistoryItem[] = Array.isArray(tasksQ.data) ? tasksQ.data : []
  const openCount = tasks.filter((tk) => !DONE.includes(tk.status)).length

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/*
        Back goes where the label says, not wherever the browser last was.

        `router.back()` looked equivalent and was not: the space page keeps its
        open tab and open type in the URL, but only a history entry created
        AFTER that was true carries them. Arriving here from a task, a search
        result or a pasted link left Back pointing at something that had nothing
        to do with the word next to the arrow. A button naming a destination has
        to go to that destination every time.
      */}
      <button
        onClick={() => router.push(backHref)}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {kind?.name ?? t("assetKinds.title", "Assets")}
      </button>

      {/* Header */}
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
          <Package className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">{asset.name}</h1>
          {shape.hasAddress && asset.locationAddress && (
            <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /> {asset.locationAddress}
            </p>
          )}
        </div>

        {/* Editing has to be reachable from the record itself. Without this the
            only way to correct anything — or add a field — was to go back to the
            space and find the row again. */}
        {/* Only when this type says a client may hold one — inviting somebody
            into an app to see a machine no client is allowed to hold is an
            offer with nothing behind it. */}
        {kind && shape.holder.enabled && shape.holder.clients && (
          <AssetInviteClient assetId={id} assetName={asset.name} spaceId={kind.spaceId} />
        )}

        {kind && (
          <AssetRaiseJob
            assetId={id}
            assetName={asset.name}
            spaceId={kind.spaceId}
            onRaised={() => qc.invalidateQueries({ queryKey: ["asset-tasks", id] })}
          />
        )}

        {kind && (
          <AssetRecordDialog
            spaceId={kind.spaceId ?? ""}
            kind={kind}
            existing={{
              id: asset.id,
              name: asset.name,
              locationAddress: asset.locationAddress,
              locationLat: asset.locationLat,
              locationLng: asset.locationLng,
              // The whole set, not the first of it. Passing one would let a
              // rename quietly drop every other resident on save.
              holders: holders.map((h) => ({ userId: h.userId, customerId: h.customerId })),
              details: asset.details,
            }}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["asset", id] })
              qc.invalidateQueries({ queryKey: ["asset-activities", id] })
            }}
            trigger={
              <Button variant="outline" size="sm" className="shrink-0">
                <Settings2 className="mr-1.5 h-3.5 w-3.5" /> {t("common.edit", "Edit")}
              </Button>
            }
          />
        )}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[300px_1fr]">
        {/* Left: about */}
        <aside className="space-y-4">
          {hasMap && (
            <div className="h-40 overflow-hidden rounded-2xl border border-border">
              <AddressMap lat={asset.locationLat!} lng={asset.locationLng!} />
            </div>
          )}

          {shape.holder.enabled && (
            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <UserCheck className="h-3.5 w-3.5" />{" "}
                {kindHolderLabel(shape, t("assetRecords.holder", "Held by"))}
              </p>
              {holders.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("assetRecords.nobodyHas", "Nobody has this one.")}</p>
              ) : (
                /* One list for one holder and for six. The single case is not a
                   different design, it is this list with one row in it — which
                   is why adding "several" needed no second layout. */
                <div className="space-y-2.5">
                  {holders.map((h) =>
                    h.user ? (
                      <button
                        key={h.id}
                        onClick={() => router.push(`/members/${h.user!.id}`)}
                        className="flex w-full items-center gap-2 text-left"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                          {initials(h.user.firstName, h.user.lastName)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground hover:text-primary">
                            {`${h.user.firstName} ${h.user.lastName}`.trim()}
                          </span>
                          <span className="text-xs text-muted-foreground">{t("assetRecords.memberTag", "Member (staff)")}</span>
                        </span>
                      </button>
                    ) : h.customer ? (
                      <div key={h.id} className="space-y-1.5">
                        <button
                          onClick={() => router.push(`/customers/${h.customer!.id}`)}
                          className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary"
                        >
                          {h.customer.name}
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                            <Smartphone className="h-2.5 w-2.5" /> {t("assetRecords.appAccess", "App access")}
                          </span>
                        </button>
                        {h.customer.email && (
                          <a href={`mailto:${h.customer.email}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
                            <Mail className="h-3 w-3" /> {h.customer.email}
                          </a>
                        )}
                        {h.customer.phone && (
                          <a href={`tel:${h.customer.phone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
                            <Phone className="h-3 w-3" /> {h.customer.phone}
                          </a>
                        )}
                      </div>
                    ) : null,
                  )}
                </div>
              )}
            </div>
          )}

          {rows.length > 0 && (
            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5" /> {t("assetRecords.fields", "Details")}
              </p>
              <dl className="divide-y divide-border/60 text-sm">
                {rows.map((d) => (
                  <div key={d.label} className="flex items-baseline justify-between gap-3 py-2">
                    <dt className="shrink-0 text-xs text-muted-foreground">{d.label}</dt>
                    <dd className="truncate text-right font-medium text-foreground">{d.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </aside>

        {/* Right: what happened to it */}
        <main className="min-w-0 space-y-4">
          <div className="flex items-center gap-1 border-b border-border/70">
            {([
              ["activity", t("assetRecords.activity", "Activity"), (actQ.data ?? []).length],
              ["history", t("assetRecords.jobs", "Jobs"), openCount || null],
              ...(shape.money.enabled
                ? [["money", t("assetMoney.title", "Money"), moneyQ.data?.entries.length || null] as const]
                : []),
              ...shape.lists.map((l) => [`list:${l.label}`, l.label, null] as const),
              ["structure", t("assetStructure.title", "Inside"), null] as const,
            ] as const).map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  tab === key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
                {count ? <span className="text-xs text-muted-foreground">{count}</span> : null}
              </button>
            ))}
          </div>

          {tab === "structure" ? (
            <AssetStructure assetId={id} kindId={kind?.id} />
          ) : tab.startsWith("list:") ? (
            (() => {
              const list = shape.lists.find((l) => `list:${l.label}` === tab)
              // The tab can outlive its list if the kind is edited while the
              // record is open; fall back rather than render nothing at all.
              if (!list) {
                return <p className="py-8 text-center text-sm text-muted-foreground">{t("assetLists.gone", "That table is no longer on this kind.")}</p>
              }
              // Cards or a grid — a display choice the kind makes, not a type
              // we recognise. Both read the same rows.
              return list.display === "cards"
                ? <AssetFaults assetId={id} assetName={asset.name} spaceId={kind?.spaceId} list={list} shape={shape} />
                : <AssetListTable assetId={id} list={list} />
            })()
          ) : tab === "money" ? (
            <MoneyPanel
              assetId={id}
              shape={shape}
              loading={moneyQ.isLoading}
              entries={moneyQ.data?.entries ?? []}
              totals={moneyQ.data?.totals}
              onChanged={() => qc.invalidateQueries({ queryKey: ["asset-money", id] })}
            />
          ) : tab === "activity" ? (
            <div className="space-y-3">
              <NoteBox assetId={id} onAdded={() => qc.invalidateQueries({ queryKey: ["asset-activities", id] })} />
              <Timeline loading={actQ.isLoading} activities={actQ.data ?? []} />
            </div>
          ) : tasksQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          ) : tasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("assetRecords.noHistory", "No tasks for this yet.")}
            </p>
          ) : (
            <div className="space-y-2">
              {tasks.map((tk) => (
                <button
                  key={tk.id}
                  onClick={() => router.push(`/tasks/${tk.id}`)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40"
                >
                  <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{tk.title}</span>
                    {tk.assignedTo && (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {`${tk.assignedTo.firstName} ${tk.assignedTo.lastName}`.trim()}
                      </span>
                    )}
                  </span>
                  <Badge
                    variant={DONE.includes(tk.status) ? "outline" : "secondary"}
                    className="shrink-0 text-[10px]"
                  >
                    {tk.status}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function NoteBox({ assetId, onAdded }: { assetId: string; onAdded: () => void }) {
  const { t } = useTranslation()
  const [body, setBody] = useState("")

  const add = useMutation({
    mutationFn: () => assetsApi.addActivity(assetId, body.trim()),
    onSuccess: () => { setBody(""); onAdded() },
    onError: (e: Error) => notify.error(e.message),
  })

  return (
    <div className="flex items-center gap-2">
      <Input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // Enter posts, so a one-line note needs no trip to the button.
          if (e.key === "Enter" && body.trim() && !add.isPending) add.mutate()
        }}
        placeholder={t("assetRecords.notePh", "Add a note — inspection, damage, handover…")}
      />
      <Button disabled={!body.trim() || add.isPending} onClick={() => add.mutate()}>
        {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1 h-3.5 w-3.5" /> {t("assetRecords.addNote", "Add note")}</>}
      </Button>
    </div>
  )
}

function Timeline({ loading, activities }: { loading: boolean; activities: AssetActivity[] }) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    )
  }
  if (activities.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{t("assetRecords.noActivity", "Nothing has happened to this one yet.")}</p>
  }

  return (
    <div className="space-y-2">
      {activities.map((a) => {
        const author = a.author ? `${a.author.firstName} ${a.author.lastName ?? ""}`.trim() : t("assetRecords.systemAuthor", "Automatic")
        return (
          <div key={a.id} className="rounded-xl border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {a.type === "HOLDER_CHANGED"
                  ? t("assetRecords.handedOver", "Changed hands")
                  : t("assetRecords.note", "Note")}
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

/**
 * What this thing has cost and earned.
 *
 * Totals come from the server over the whole ledger, never from adding up the
 * rows on screen — those are only the most recent ones.
 */
function MoneyPanel({
  assetId, shape, loading, entries, totals, onChanged,
}: {
  assetId: string
  shape: KindShape
  loading: boolean
  entries: AssetMoneyEntry[]
  totals?: { inCents: number; outCents: number; netCents: number }
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [category, setCategory] = useState(shape.money.categories[0]?.label ?? "")
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")

  const add = useMutation({
    mutationFn: () =>
      assetsApi.addMoney(assetId, {
        category,
        // Typed in euros, stored in cents — the comma is what people actually
        // type on a German keyboard.
        amountCents: Math.round(parseFloat(amount.replace(",", ".")) * 100),
        note: note.trim() || undefined,
      }),
    onSuccess: () => { setAmount(""); setNote(""); onChanged() },
    onError: (e: Error) => notify.error(e.message),
  })

  const remove = useMutation({
    mutationFn: (entryId: string) => assetsApi.removeMoney(assetId, entryId),
    onSuccess: onChanged,
    onError: (e: Error) => notify.error(e.message),
  })

  const parsed = parseFloat(amount.replace(",", "."))
  const canAdd = !!category && Number.isFinite(parsed) && parsed > 0 && !add.isPending

  if (shape.money.categories.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("assetMoney.noCategories", "This kind tracks money but has no categories yet — add some on the kind.")}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Totals */}
      {totals && (
        <div className="grid gap-2 sm:grid-cols-3">
          <Total label={t("assetMoney.in", "In")} cents={totals.inCents} tone="in" />
          <Total label={t("assetMoney.out", "Out")} cents={totals.outCents} tone="out" />
          <Total label={t("assetMoney.net", "Net")} cents={totals.netCents} tone={totals.netCents >= 0 ? "in" : "out"} />
        </div>
      )}

      {/* Add */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
        >
          {shape.money.categories.map((c) => (
            <option key={c.label} value={c.label}>
              {c.label} {c.direction === "in" ? "↓" : "↑"}
            </option>
          ))}
        </select>
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={t("assetMoney.amount", "Amount")}
          inputMode="decimal"
          className="w-28"
        />
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("assetMoney.notePh", "What for?")}
          className="min-w-[8rem] flex-1"
        />
        <Button disabled={!canAdd} onClick={() => add.mutate()}>
          {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1 h-3.5 w-3.5" /> {t("common.add", "Add")}</>}
        </Button>
      </div>

      {/* Entries */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("assetMoney.empty", "Nothing logged yet.")}</p>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <div key={e.id} className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{e.category}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {new Date(e.occurredAt).toLocaleDateString()}
                  {e.note ? ` · ${e.note}` : ""}
                </p>
              </div>
              <span className={cn(
                "shrink-0 text-sm font-semibold tabular-nums",
                e.direction === "IN" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
              )}>
                {e.direction === "IN" ? "+" : "−"} {formatCents(e.amountCents)}
              </span>
              <button
                onClick={() => remove.mutate(e.id)}
                className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                aria-label={t("common.remove", "Remove")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Total({ label, cents, tone }: { label: string; cents: number; tone: "in" | "out" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn(
        "text-lg font-semibold tabular-nums",
        tone === "in" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
      )}>
        {formatCents(Math.abs(cents))}
      </p>
    </div>
  )
}
