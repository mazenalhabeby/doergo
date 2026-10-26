"use client"

import { useTranslation } from "react-i18next"
import { Loader2, PenLine, DownloadCloud, Upload } from "lucide-react"
import { waitingOnMember } from "@hbcfield/shared/client"
import { SupplyDocumentDialog } from "./_components/supply-document-dialog"
import { Button } from "@/components/ui/button"
import { Chip, Notice, PageHeader, Panel } from "@/components/page/page-kit"
import { useMyDocumentsPage } from "./_hooks/use-my-documents-page"
import { MyDocumentList } from "./_components/my-document-list"
import { FilterPill, FilterPills, SearchPill } from "@/components/page/page-controls"

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
  const { t } = useTranslation()
  const {
    isExternalMember,
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
    documents,
    isLoading,
    requirements,
    visible,
    years,
    usedTypes,
    awaiting,
    exportAll,
  } = useMyDocumentsPage()

  const waiting = requirements.filter(waitingOnMember)
  const typeTabs = [{ id: null as string | null, label: t("documents.allTypes") }, ...usedTypes]

  return (
    <div className="w-full">
      <PageHeader
        title={t("documents.my.title")}
        subtitle={t("documents.my.subtitle")}
        actions={
          <>
            {/* Only when the organization actually asks its members for something — and never for an external member:
                the company asks somebody else's employee for nothing (the server refuses it too). */}
            {!isExternalMember && types.some((ty) => ty.direction !== "ISSUED" && ty.isActive) && (
              <Button size="pillLg" onClick={() => setSupplying(true)}>
                <Upload />
                {t("documents.supply.action")}
              </Button>
            )}
            {documents.length > 0 && (
              <Button variant="outline" size="pill" onClick={() => exportAll.mutate()} disabled={exportAll.isPending}>
                {exportAll.isPending ? <Loader2 className="animate-spin" /> : <DownloadCloud />}
                {t("documents.export.action")}
              </Button>
            )}
          </>
        }
      />

      {/*
        What the organization is still waiting for FROM YOU — only the ones where the next move is theirs. A licence
        already sent and sitting in the review queue is not something to chase somebody about.
      */}
      {waiting.length > 0 && (
        <Panel as="div" className="mb-3.5 px-5 py-4">
          <div className="mb-1.5 flex items-center gap-2.5">
            <h3 className="flex-1 text-[15px] font-semibold text-foreground">{t("documents.required.title")}</h3>
            {waiting.some((r) => r.blocksWork) && (
              <Chip tone="crit" dot>
                {t("documents.required.blocksWork")}
              </Chip>
            )}
          </div>
          {waiting.map((r) => (
            <div
              key={r.typeId}
              className="flex flex-wrap items-center gap-3.5 border-t border-border py-3 first-of-type:border-t-0"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <b className="text-[14.5px] font-semibold text-foreground">{r.label}</b>
                <span className="text-[12.5px] text-muted-foreground">{t(`documents.required.state.${r.state}`)}</span>
              </div>
              {r.blocksWork && (
                <Chip tone="warn" dot>
                  {t("documents.required.blocksWork")}
                </Chip>
              )}
            </div>
          ))}
          {!isExternalMember && (
            <Button size="pill" className="mt-2" onClick={() => setSupplying(true)}>
              <Upload />
              {t("documents.supply.action")}
            </Button>
          )}
        </Panel>
      )}

      <SupplyDocumentDialog types={types} open={supplying} onClose={() => setSupplying(false)} />

      {exported && (
        <Panel as="div" className="mb-3.5 px-5 py-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-[15px] font-semibold text-foreground">
              {t("documents.export.ready", { count: exported.length })}
            </p>
            <button
              onClick={() => setExported(null)}
              className="text-[13px] font-semibold text-muted-foreground hover:text-foreground"
            >
              {t("common.close")}
            </button>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">{t("documents.export.hint")}</p>
          <ul className="space-y-1">
            {exported.map((f, i) => (
              <li key={i}>
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-shell-accent hover:underline"
                >
                  {f.title}
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* Anything needing a signature is lifted above the list — the only thing here waiting on the reader. */}
      {awaiting.length > 0 && (
        <Notice className="items-start py-3.5">
          <PenLine className="mt-0.5" />
          <span className="min-w-0 flex-1">
            <b className="block font-semibold">{t("documents.my.awaiting", { count: awaiting.length })}</b>
            <span className="text-muted-foreground">{awaiting.map((d) => d.title).join(" · ")}</span>
          </span>
        </Notice>
      )}

      <Panel as="div" className="px-5 py-4">
        {/* Filters */}
        <div className="mb-2 flex flex-wrap items-center gap-2.5">
          <SearchPill
            className="sm:w-[280px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("documents.searchPlaceholder")}
          />
          {years.length > 1 && (
            <select
              value={year ?? ""}
              onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}
              aria-label={t("documents.year")}
              className="h-[38px] rounded-xl border border-border bg-card px-3.5 text-[13.5px] text-foreground"
            >
              <option value="">{t("documents.allYears")}</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}

          {/* Type pills — only ones with documents behind them */}
          {usedTypes.length > 0 && (
            <FilterPills>
              {typeTabs.map((ty) => (
                <FilterPill key={ty.id ?? "all"} active={activeType === ty.id} onClick={() => setActiveType(ty.id)}>
                  {ty.label}
                </FilterPill>
              ))}
            </FilterPills>
          )}
        </div>

        {/* The list */}
        <MyDocumentList isLoading={isLoading} visible={visible} hasDocuments={documents.length > 0} types={types} />
      </Panel>
    </div>
  )
}
