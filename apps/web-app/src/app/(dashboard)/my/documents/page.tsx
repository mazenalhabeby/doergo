"use client"

import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Search, Download, Loader2, FileText, Image as ImageIcon,
  ShieldCheck, ShieldAlert, ShieldX, PenLine, Trash2, Inbox, DownloadCloud, Upload, Clock, XCircle, AlertTriangle,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { documentsApi, type MemberDocumentRow, type DocumentTypeRow, type RequirementRow } from "@/lib/api"
import { formatFileSize, memberMayDelete, waitingOnMember } from "@hbcfield/shared/client"
import { SupplyDocumentDialog } from "./_components/supply-document-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { notify } from "@/lib/toast"
import { useOpenDocument } from "@/hooks/use-open-document"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"
import { keys } from "@/lib/query-keys"
import { dateLocale } from "@/lib/format-date"
import { useMyDocumentsPage } from "./use-my-documents-page"
import { MONTHS_KEY, StandingChip } from "./my-documents-page-helpers"
import { MyDocumentsPageMy } from "./my-documents-page-my"

/*
  A member's own file.

  Three decisions here came out of looking at how payroll portals actually get
  used, and at the screens this was modelled on:

  1. TABS BY TYPE, not folders. Document types are static and mutually
     exclusive — a payslip is never also a contract — which is exactly the case
     tabs are for. Folders would invite nesting nobody needs.

  2. SEARCH IS PRESENT FROM THE START. It is the single most-used control in
     any document product; adding it "later" means a year of people scrolling.

  3. NOTHING IS PREFETCHED. Rows carry no download link: one is minted only when
     someone clicks, and that mint is what records the document as opened. A
     grid of live links would make "opened" mean "the page rendered".
*/

export default function MyDocumentsPage() {
  const vm = useMyDocumentsPage()
  const {
    t,
    i18n,
    isExternalMember,
    router,
    activeType,
    setActiveType,
    year,
    setYear,
    search,
    setSearch,
    exported,
    setExported,
    supplying,
    setSupplying,
    types,
    mayRemove,
    documents,
    isLoading,
    requirements,
    visible,
    years,
    usedTypes,
    awaiting,
    open,
    opening,
    exportAll,
    remove,
  } = vm

  return (
    <div className="w-full">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {t("documents.my.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("documents.my.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Only when the organization actually asks its members for
              something. An upload button on an organization that issues
              everything is an invitation to be refused. */}
          {/* And never for an external member: the company asks somebody else's
              employee for nothing, so there is nothing here for them to supply.
              The server refuses it too — this only avoids offering it. */}
          {!isExternalMember && types.some((ty) => ty.direction !== "ISSUED" && ty.isActive) && (
            <Button size="sm" onClick={() => setSupplying(true)}>
              <Upload className="mr-2 h-4 w-4" />
              {t("documents.supply.action")}
            </Button>
          )}
          {documents.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => exportAll.mutate()} disabled={exportAll.isPending}>
              {exportAll.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <DownloadCloud className="mr-2 h-4 w-4" />}
              {t("documents.export.action")}
            </Button>
          )}
        </div>
      </header>

      {/*
        What the organization is still waiting for FROM YOU.

        Deliberately only the ones where the next move is theirs. A licence
        already sent and sitting in the review queue is not something to chase
        somebody about — "send us your licence", under a licence they sent
        yesterday, is the fastest way to teach a person that this screen is
        wrong and can be ignored.
      */}
      {requirements.filter(waitingOnMember).length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            {t("documents.required.title")}
          </p>
          <ul className="space-y-1.5">
            {requirements.filter(waitingOnMember).map((r) => (
              <li key={r.typeId} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-800 dark:text-slate-200">{r.label}</span>
                <span className="text-slate-500 dark:text-slate-400">
                  {t(`documents.required.state.${r.state}`)}
                </span>
                {r.blocksWork && (
                  <span
                    className={"rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold " +
                      "text-amber-700 dark:bg-amber-950 dark:text-amber-400"}>
                    {t("documents.required.blocksWork")}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {!isExternalMember && (
            <Button size="sm" className="mt-3" onClick={() => setSupplying(true)}>
              <Upload className="mr-2 h-4 w-4" />
              {t("documents.supply.action")}
            </Button>
          )}
        </div>
      )}

      <SupplyDocumentDialog
        types={types}
        open={supplying}
        onClose={() => setSupplying(false)}
      />

      {exported && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("documents.export.ready", { count: exported.length })}
            </p>
            <button onClick={() => setExported(null)} className="text-xs text-slate-400 hover:text-slate-700">
              {t("common.close")}
            </button>
          </div>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            {t("documents.export.hint")}
          </p>
          <ul className="space-y-1">
            {exported.map((f, i) => (
              <li key={i}>
                <a href={f.url} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                  {f.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        Anything needing a signature is lifted above the list.

        It is the only thing on this page that is waiting on the person reading
        it; leaving it in date order among twelve payslips is how it gets missed.
      */}
      {awaiting.length > 0 && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-600 text-white">
              <PenLine className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t("documents.my.awaiting", { count: awaiting.length })}
              </p>
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                {awaiting.map((d) => d.title).join(" · ")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("documents.searchPlaceholder")}
            className="pl-9"
            aria-label={t("documents.searchPlaceholder")}
          />
        </div>
        {years.length > 1 && (
          <select
            value={year ?? ""}
            onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}
            aria-label={t("documents.year")}
            className={"h-10 rounded-md border border-slate-200 bg-white px-3 text-sm " +
              "text-slate-900 dark:border-slate-700 dark:bg-slate-900 " +
              "dark:text-slate-100"}
          >
            <option value="">{t("documents.allYears")}</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        )}
      </div>

      {/* Type tabs — only ones with documents behind them */}
      {usedTypes.length > 0 && (
        <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" role="tablist">
          <button
            role="tab"
            aria-selected={activeType === null}
            onClick={() => setActiveType(null)}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              activeType === null
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
            )}
          >
            {t("documents.allTypes")}
          </button>
          {usedTypes.map((ty) => (
            <button
              key={ty.id}
              role="tab"
              aria-selected={activeType === ty.id}
              onClick={() => setActiveType(ty.id)}
              className={cn(
                "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                activeType === ty.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
              )}
            >
              {ty.label}
            </button>
          ))}
        </div>
      )}

      {/* The list */}
      <MyDocumentsPageMy vm={vm} />
    </div>
  )
}
