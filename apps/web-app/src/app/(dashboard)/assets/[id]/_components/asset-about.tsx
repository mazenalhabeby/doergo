"use client"

import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { ListChecks, Mail, Phone, ShieldAlert, Smartphone, UserCheck } from "lucide-react"

import {
  personInitials, personName, detailRowsForKind, kindHolderLabel, warrantyState, type KindShape,
} from "@hbcfield/shared/client"
import { cn } from "@/lib/utils"
import { dateLocale } from "@/lib/format-date"
import type { AssetDetail } from "../_lib/asset-detail"

const AddressMap = dynamic(() => import("../../../clients/[id]/_components/address-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-muted" />,
}) as unknown as React.ComponentType<{ lat: number | null; lng: number | null }>

/** The left column of a record: the map, who has it, and what you record about it. */
export function AssetAbout({ asset, shape }: { asset: AssetDetail; shape: KindShape }) {
  const { t } = useTranslation()
  const router = useRouter()

  const rows = detailRowsForKind(shape, asset.details).filter((r) => r.value)
  /*
    The plate, beside the kind's own fields — only the ones filled in.

    A date is shown as a date, not as the ISO string the API carries, and the
    warranty says where it stands: within thirty days it is worth a glance, past
    it the next repair is not covered, and that is the moment somebody looks.
  */
  const warranty = warrantyState(asset.warrantyExpiry)
  const facts = [
    { key: "serial", label: t("assetFacts.more.serial", "Serial number"), value: asset.serialNumber },
    { key: "manufacturer", label: t("assetFacts.more.manufacturer", "Manufacturer"), value: asset.manufacturer },
    { key: "model", label: t("assetFacts.more.model", "Model"), value: asset.model },
    {
      key: "install",
      label: t("assetFacts.more.installDate", "Installed on"),
      value: asset.installDate ? new Date(asset.installDate).toLocaleDateString(dateLocale()) : null,
    },
    {
      key: "warranty",
      label: t("assetFacts.more.warrantyExpiry", "Warranty until"),
      value: asset.warrantyExpiry ? new Date(asset.warrantyExpiry).toLocaleDateString(dateLocale()) : null,
    },
  ].filter((f) => f.value)
  const holders = asset.holders ?? []
  const hasMap = shape.hasAddress && asset.locationLat != null && asset.locationLng != null

  return (
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
                    <span
                      className={"flex h-8 w-8 shrink-0 items-center justify-center rounded-full " +
                        "bg-primary/10 text-[11px] font-semibold text-primary"}>
                      {personInitials(h.user)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground hover:text-primary">
                        {personName(h.user)}
                      </span>
                      <span className="text-xs text-muted-foreground">{t("assetRecords.memberTag", "Member (staff)")}</span>
                    </span>
                  </button>
                ) : h.customer ? (
                  <div key={h.id} className="space-y-1.5">
                    <button
                      onClick={() => router.push(`/clients/${h.customer!.id}`)}
                      className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary"
                    >
                      {h.customer.name}
                      <span
                        className={"inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 " +
                          "text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 " +
                          "dark:text-emerald-300"}>
                        <Smartphone className="h-2.5 w-2.5" /> {t("assetRecords.appAccess", "App access")}
                      </span>
                    </button>
                    {h.customer.email && (
                      <a
                        href={`mailto:${h.customer.email}`}
                        className={"flex items-center gap-1.5 text-xs text-muted-foreground " + "hover:text-primary"}>
                        <Mail className="h-3 w-3" /> {h.customer.email}
                      </a>
                    )}
                    {h.customer.phone && (
                      <a
                        href={`tel:${h.customer.phone}`}
                        className={"flex items-center gap-1.5 text-xs text-muted-foreground " + "hover:text-primary"}>
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

      {(rows.length > 0 || facts.length > 0 || !!asset.notes) && (
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
            {facts.map((f) => {
              const flagged = f.key === "warranty" && (warranty === "expired" || warranty === "soon")
              return (
                <div key={f.key} className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="shrink-0 text-xs text-muted-foreground">{f.label}</dt>
                  <dd
                    className={cn(
                      "truncate text-right font-medium text-foreground",
                      flagged && warranty === "expired" && "text-destructive",
                      flagged && warranty === "soon" && "text-amber-600 dark:text-amber-400",
                    )}
                  >
                    {f.value}
                  </dd>
                </div>
              )
            })}
          </dl>
          {warranty === "expired" || warranty === "soon" ? (
            <p className={cn(
              "mt-1 flex items-center justify-end gap-1 text-[11px] font-medium",
              warranty === "expired" ? "text-destructive" : "text-amber-600 dark:text-amber-400",
            )}>
              <ShieldAlert className="h-3.5 w-3.5" />
              {warranty === "expired"
                ? t("assetFacts.warranty.expired", "Warranty ended")
                : t("assetFacts.warranty.soon", "Warranty ends soon")}
            </p>
          ) : null}
          {asset.notes && (
            <p className="mt-2 whitespace-pre-wrap border-t border-border/60 pt-2 text-sm text-foreground">
              {asset.notes}
            </p>
          )}
        </div>
      )}
    </aside>
  )
}
