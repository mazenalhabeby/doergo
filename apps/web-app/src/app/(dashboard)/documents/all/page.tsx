"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { ArrowLeft, FolderTree, ListChecks, PenLine, MailOpen, CheckCircle2, FileText } from "lucide-react"
import { PAGE_SHELL } from "@/components/ui/page-width"
import { Count, PageHeader } from "@/components/page/page-kit"
import { cn } from "@/lib/utils"
import { FolderBrowser } from "./_components/folder-browser"
import { DocumentActionDialogs } from "./_components/document-control"
import { useSentRegister, type Tab } from "./_hooks/use-sent-register"
import { SentDocumentsList } from "./_components/sent-documents-list"
import { ListPager } from "@/components/ui/list-pager"
import { SearchPill } from "@/components/page/page-controls"

const TABS: { key: Tab; icon: typeof PenLine }[] = [
  { key: "awaiting", icon: PenLine },
  { key: "unopened", icon: MailOpen },
  { key: "signed", icon: CheckCircle2 },
  { key: "all", icon: FileText },
]

export default function SentDocumentsPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [view, setView] = useState<"attention" | "files">("attention")
  const {
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
  } = useSentRegister()

  return (
    <div className="min-h-full">
      <div className={PAGE_SHELL}>
        <button
          onClick={() => router.push("/documents")}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t("common.back", "Back")}
        </button>
        <PageHeader
          title={
            <>
              {t("documents.all.title", "Sent documents")}
              {counts != null && <span className="ml-2 font-normal text-muted-foreground">{counts.all}</span>}
            </>
          }
          subtitle={t("documents.all.subtitle", "Everything issued to members, and where it got to.")}
          actions={
            /* Which way of looking — the board's segmented switch (`dcseg`). */
            <div className="inline-flex gap-0.5 rounded-xl bg-shell-chip p-[3px]">
              {(
                [
                  ["attention", ListChecks],
                  ["files", FolderTree],
                ] as const
              ).map(([key, Icon]) => (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  aria-pressed={view === key}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-[9px] px-3.5 text-[13px] font-medium transition-colors",
                    view === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t(`documents.all.view.${key}`)}
                </button>
              ))}
            </div>
          }
        />

        {view === "files" ? (
          <FolderBrowser />
        ) : (
          <>
            {/* Tabs, each stating its count so a click is a decision not a guess */}
            <div className="mb-4 flex flex-wrap items-end gap-x-[26px] gap-y-2 border-b border-border">
              {TABS.map(({ key, icon: Icon }) => {
                const active = tab === key
                const n = counts?.[key]
                return (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      userPicked.current = true
                      setTab(key)
                      setPage(1)
                    }}
                    className={cn(
                      "-mb-px inline-flex h-11 items-center gap-2 border-b-2 text-[14.5px] transition-colors",
                      active
                        ? "border-foreground font-semibold text-foreground"
                        : "border-transparent font-medium text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t(`documents.all.tab.${key}`)}
                    {typeof n === "number" && <Count n={n} tone={key === "awaiting" && n > 0 ? "warn" : "soft"} />}
                  </button>
                )
              })}

              <SearchPill
                className="mb-2 ml-auto sm:w-64"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder={t("documents.all.searchPlaceholder", "Search by title")}
              />
            </div>

            <SentDocumentsList
              isLoading={isLoading}
              rows={rows}
              tab={tab}
              selection={selection}
              setAction={setAction}
              canSelect={canSelect}
            />

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
