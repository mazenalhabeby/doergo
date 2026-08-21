"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Package,
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Tag,
  Hash,
  MapPin,
  Calendar,
} from "lucide-react"
import Link from "next/link"

import { useAuth } from "@/contexts/auth-context"
import { assetsApi, type Asset, type AssetStatus } from "@/lib/api"
import { cn } from "@/lib/utils"
import { notify } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const STATUS_STYLES: Record<string, { bg: string; text: string; labelKey: string }> = {
  ACTIVE: { bg: "bg-green-100 dark:bg-green-500/20", text: "text-green-700 dark:text-green-400", labelKey: "common.active" },
  MAINTENANCE: { bg: "bg-amber-100 dark:bg-amber-500/20", text: "text-amber-700 dark:text-amber-400", labelKey: "assets.status.maintenance" },
  RETIRED: { bg: "bg-slate-100 dark:bg-slate-500/20", text: "text-slate-600 dark:text-slate-400", labelKey: "assets.status.retired" },
  OUT_OF_SERVICE: { bg: "bg-red-100 dark:bg-red-500/20", text: "text-red-700 dark:text-red-400", labelKey: "assets.status.outOfService" },
}

export default function AssetsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = user?.role === "ADMIN"

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("__all__")
  const [categoryFilter, setCategoryFilter] = useState("__all__")

  const { data: assets, isLoading } = useQuery({
    queryKey: ["assets", search, statusFilter, categoryFilter],
    queryFn: () => assetsApi.getAssets({
      search: search || undefined,
      status: statusFilter !== "__all__" ? (statusFilter as AssetStatus) : undefined,
      categoryId: categoryFilter !== "__all__" ? categoryFilter : undefined,
    }),
  })

  const { data: categories } = useQuery({
    queryKey: ["asset-categories"],
    queryFn: () => assetsApi.getCategories(),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => assetsApi.deleteAsset(id),
    onSuccess: () => {
      notify.success(t("assets.toast.deleted"))
      queryClient.invalidateQueries({ queryKey: ["assets"] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const assetList: Asset[] = assets?.data ?? []

  const filtered = search
    ? assetList.filter((a) =>
        a.name?.toLowerCase().includes(search.toLowerCase()) ||
        a.serialNumber?.toLowerCase().includes(search.toLowerCase())
      )
    : assetList

  return (
    <div className="min-h-full bg-muted">
      <div className="p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 data-tour="page-assets" className="text-2xl font-semibold text-foreground">{t("assets.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("assets.subtitle")}</p>
          </div>
          {isAdmin && (
            <Button size="sm" className="gap-1.5">
              <Plus className="size-3.5" /> {t("assets.addAsset")}
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("assets.searchPlaceholder")}
              className="h-8 text-sm pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-sm w-[140px]">
              <SelectValue placeholder={t("common.status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("common.allStatuses")}</SelectItem>
              <SelectItem value="ACTIVE">{t("common.active")}</SelectItem>
              <SelectItem value="MAINTENANCE">{t("assets.status.maintenance")}</SelectItem>
              <SelectItem value="RETIRED">{t("assets.status.retired")}</SelectItem>
              <SelectItem value="OUT_OF_SERVICE">{t("assets.status.outOfService")}</SelectItem>
            </SelectContent>
          </Select>
          {categories && categories.length > 0 && (
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-8 text-sm w-[160px]">
                <SelectValue placeholder={t("assets.category")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("assets.allCategories")}</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Table */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_120px_120px_100px_80px_40px] gap-3 px-4 py-2.5 bg-muted/30 text-[11px] font-medium text-muted-foreground uppercase tracking-wider border-b border-border/30">
            <div>{t("assets.table.asset")}</div>
            <div>{t("assets.table.serial")}</div>
            <div>{t("assets.category")}</div>
            <div>{t("assets.table.location")}</div>
            <div>{t("common.status")}</div>
            <div />
          </div>

          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Package className="size-10 mx-auto text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">{t("assets.noAssets")}</p>
              {isAdmin && <p className="text-xs text-muted-foreground/60 mt-1">{t("assets.noAssetsHint")}</p>}
            </div>
          ) : (
            filtered.map((asset) => {
              const status = STATUS_STYLES[asset.status] || STATUS_STYLES.ACTIVE!
              return (
                <div key={asset.id} className="grid grid-cols-[1fr_120px_120px_100px_80px_40px] gap-3 px-4 py-3 border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors items-center">
                  {/* Name */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{asset.name}</p>
                    {asset.type && <p className="text-[11px] text-muted-foreground truncate">{asset.type.name}</p>}
                  </div>

                  {/* Serial */}
                  <span className="text-xs text-muted-foreground font-mono truncate">{asset.serialNumber || "—"}</span>

                  {/* Category */}
                  <span className="text-xs text-muted-foreground truncate">{asset.category?.name || "—"}</span>

                  {/* Location — the field is `locationAddress`; `location` has
                      never existed on an asset, so this column was always a dash. */}
                  <span className="text-xs text-muted-foreground truncate">{asset.locationAddress || "—"}</span>

                  {/* Status */}
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full text-center", status.bg, status.text)}>
                    {t(status.labelKey)}
                  </span>

                  {/* Actions */}
                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="size-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                          <MoreHorizontal className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem>
                          <Pencil className="size-3.5 mr-2" /> {t("common.edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onClick={() => deleteMutation.mutate(asset.id)}
                        >
                          <Trash2 className="size-3.5 mr-2" /> {t("common.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
