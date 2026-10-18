"use client"

import { ArrowLeft, Search, FolderTree, ListChecks } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { FolderBrowser } from "./_components/folder-browser"
import { DocumentActionDialogs } from "./_components/document-control"
import { useSentDocumentsPage } from "./use-sent-documents-page"
import { TABS } from "./sent-documents-page-helpers"
import { SentDocumentsPageControl } from "./sent-documents-page-control"
import { ListPager } from "@/components/ui/list-pager"

export default function SentDocumentsPage() {
  const vm = useSentDocumentsPage()
  const {
    t,
    i18n,
    router,
    view,
    setView,
    tab,
    setTab,
    search,
    setSearch,
    page,
    setPage,
    data,
    isLoading,
    isFetching,
    rows,
    counts,
    canSelect,
    selection,
    action,
    setAction,
    totalPages,
    userPicked,
    open,
    opening,
  } = vm

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-[1200px] px-6 py-6">
        {/* Header */}
        <div className="mb-8 flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/documents")}
            aria-label={t("common.back", "Back")}
            className="mt-0.5 h-9 w-9 shrink-0 text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t("documents.all.title", "Sent documents")}
              {counts != null && <span className="ml-2 text-lg font-normal text-muted-foreground">({counts.all})</span>}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("documents.all.subtitle", "Everything issued to members, and where it got to.")}
            </p>
          </div>
        </div>

        {/* Which way of looking */}
        <div className="mb-6 inline-flex rounded-lg border border-border/80 bg-card p-0.5">
          {(
            [
              ["attention", ListChecks],
              ["files", FolderTree],
            ] as const
          ).map(([key, Icon]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                view === key ? "bg-accent text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {t(`documents.all.view.${key}`)}
            </button>
          ))}
        </div>

        {view === "files" ? (
          <FolderBrowser />
        ) : (
          <>
            {/* Tabs, each stating its count so a click is a decision not a guess */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {TABS.map(({ key, icon: Icon }) => {
                const active = tab === key
                const n = counts?.[key]
                return (
                  <button
                    key={key}
                    onClick={() => {
                      userPicked.current = true
                      setTab(key)
                      setPage(1)
                    }}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
                      active
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border/80 bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t(`documents.all.tab.${key}`)}
                    {typeof n === "number" && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                          active ? "bg-primary/15" : "bg-muted",
                        )}
                      >
                        {n}
                      </span>
                    )}
                  </button>
                )
              })}

              <div className="relative ml-auto">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  placeholder={t("documents.all.searchPlaceholder", "Search by title")}
                  className="h-9 w-56 rounded-lg border-border/80 bg-card pl-9 text-sm"
                />
              </div>
            </div>

            <SentDocumentsPageControl vm={vm} />

            {data && data.total > data.limit && (
              <ListPager
                page={page}
                totalPages={totalPages}
                setPage={setPage}
                framed={false}
                disabled={isFetching}
                label={
                  <>
                    {t("documents.all.count", { count: data.total })} · {t("common.page", { page, totalPages })}
                  </>
                }
              />
            )}
          </>
        )}
      </div>
      <DocumentActionDialogs
        action={action?.kind ?? null}
        rows={action?.rows ?? []}
        onClose={() => setAction(null)}
        onDone={selection.clear}
      />
    </div>
  )
}
