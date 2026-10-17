"use client"

import { use, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { AlertCircle, Download, FileQuestion, Loader2, RefreshCw } from "lucide-react"
import { personName, CLIENT_COPY_OPTIONS, type ClientCopyOption, type TaskReport, type TaskReportCopy } from "@hbcfield/shared/client"

import { tasksApi } from "@/lib/api"
import { notify } from "@/lib/toast"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { InvoiceTopBar, InvoiceWorkbench } from "@/app/(dashboard)/invoices/_components/invoice-shell"
import { CopySwitch, HeadSwitches, IssuerPicker, ReportRail } from "./_components/report-rail"
import { ReportSheet } from "./_components/report-sheet"
import { useTaskPermissions } from "@/hooks/use-task-permissions"
import { JobReportPageSkeleton, ReportSheetSkeleton } from "./_components/report-skeleton"
import {
  availableHeadToggles, availableToggles, loadClientInclude, loadHeadOff, loadIssuerChoice, loadOffToggles, normalizeInclude,
  reportQueryKey, saveClientInclude, saveHeadOff, saveIssuerChoice, saveOffToggles, showPrices, visibleSections,
  type HeadToggle, type ReportToggle, type Translate,
} from "./_lib/report-model"

/**
 * The job report — one job, start to finish, as the office keeps it or as the
 * client receives it (shared tasks/task-report.ts).
 *
 * ⚠️ The CLIENT copy is cut on the SERVER. This page only chooses which copy to
 * ask for and what the office adds back to it (`?include=`), then draws what
 * came back; the section switches only HIDE what was received.
 *
 * One request per copy (and per include choice); both copies stay cached, so
 * switching back is instant. The PDF engine is fetched when Download is pressed.
 */
export default function JobReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t, i18n } = useTranslation()
  const tt = t as unknown as Translate
  const router = useRouter()
  const { user } = useAuth()

  const [copy, setCopy] = useState<TaskReportCopy>("office")
  const [include, setInclude] = useState<ClientCopyOption[]>([])
  const [off, setOff] = useState<Set<ReportToggle>>(new Set())
  const [headOff, setHeadOff] = useState<Set<HeadToggle>>(new Set())
  // "Issued by": null = the automatic rule (workspace → client → main company).
  const [issuer, setIssuer] = useState<string | null>(null)
  // The workspace whose remembered choices are loaded (undefined = not yet known).
  const [prefsFor, setPrefsFor] = useState<string | null | undefined>(undefined)

  const query = useQuery({
    queryKey: reportQueryKey(id, copy, include, issuer),
    queryFn: () => tasksApi.getFullReport(id, copy, include, issuer),
    // Photo, document and signature links are signed and short-lived.
    staleTime: 5 * 60_000,
    // Changing what the client sees keeps the client page up while it reloads —
    // never the office copy under a "Client copy" label.
    placeholderData: (prev: TaskReport | undefined) => (prev?.meta.copy === copy ? prev : undefined),
    // The client copy waits until this workspace's remembered choices are known.
    enabled: copy === "office" || prefsFor !== undefined,
    retry: (count, err) => ![404, 409].includes((err as { status?: number }).status ?? 0) && count < 2,
  })
  const report = query.data

  // The workspace is known once the first copy arrives; its remembered choices load then.
  const spaceId = report ? (report.header.workspace?.id ?? null) : undefined
  // The route may be added to the client copy by whoever may read it: org-wide
  // tracking, or tracking in THIS job's workspace (the gateway's rule).
  const { canViewRoute: canViewTracking } = useTaskPermissions(spaceId === undefined ? null : { spaceId })
  useEffect(() => {
    if (spaceId === undefined || spaceId === prefsFor) return
    setOff(loadOffToggles(spaceId))
    setHeadOff(loadHeadOff(spaceId))
    setInclude(loadClientInclude(spaceId, CLIENT_COPY_OPTIONS))
    // Only a company still offered — a remembered one since switched off falls back to automatic.
    setIssuer(loadIssuerChoice(spaceId, report?.meta.issuers))
    setPrefsFor(spaceId)
  }, [spaceId, prefsFor, report?.meta.issuers])

  const toggle = (tg: ReportToggle, on: boolean) => {
    const next = new Set(off)
    if (on) next.delete(tg)
    else next.add(tg)
    setOff(next)
    saveOffToggles(prefsFor, next)
  }
  // A remembered company switched off since: the server refuses it (400) — fall back to automatic, never a dead page.
  const queryStatus = query.isError ? (query.error as { status?: number }).status : undefined
  useEffect(() => {
    if (queryStatus === 400 && issuer) {
      setIssuer(null)
      saveIssuerChoice(prefsFor, null)
    }
  }, [queryStatus, issuer, prefsFor])

  const toggleHead = (tg: HeadToggle, on: boolean) => {
    const next = new Set(headOff)
    if (on) next.delete(tg)
    else next.add(tg)
    setHeadOff(next)
    saveHeadOff(prefsFor, next)
  }
  const chooseIssuer = (next: string | null) => {
    setIssuer(next)
    saveIssuerChoice(prefsFor, next)
  }
  const setIncluded = (opt: ClientCopyOption, on: boolean) => {
    const next = normalizeInclude(on ? [...include, opt] : include.filter((o) => o !== opt))
    setInclude(next)
    saveClientInclude(prefsFor, next)
  }

  const available = useMemo(() => (report ? availableToggles(report) : []), [report])
  const headAvailable = useMemo(() => (report ? availableHeadToggles(report, tt) : null), [report, tt])
  const visible = useMemo(() => (report ? visibleSections(report, off) : []), [report, off])
  const prices = report ? showPrices(report, off) : false
  const generatedBy = personName(user)

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [building, setBuilding] = useState(false)
  const download = async () => {
    if (!report || building) return
    setBuilding(true)
    try {
      // The PDF engine is only fetched now — never with the page.
      const { downloadJobReportPdf } = await import("./_lib/job-report-pdf")
      await downloadJobReportPdf({
        report,
        visible,
        showPrices: prices,
        headOff,
        t: tt,
        locale: i18n.language || "en",
        generatedBy,
        onProgress: (done, total) => setProgress(total ? { done, total } : null),
      })
    } catch {
      notify.error(t("tasks.report.downloadFailed"))
    } finally {
      setBuilding(false)
      setProgress(null)
    }
  }

  const back = () => router.push(`/tasks/${id}`)

  if (query.isLoading && !report && copy === "office") return <JobReportPageSkeleton />

  if (query.isError && !report) {
    const status = (query.error as { status?: number }).status
    // 409 = the job is not finished yet (REPORT_NOT_FINISHED): nothing to retry, just wait for it.
    const notFinished = status === 409
    const notFound = status === 404 || notFinished
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
        {notFound ? <FileQuestion className="size-10 text-muted-foreground" /> : <AlertCircle className="size-10 text-red-500" />}
        <h1
          className="mt-4 text-lg font-semibold text-foreground">{notFinished
            ? t("tasks.report.notFinished")
            : notFound ? t("tasks.report.notAvailable") : t("tasks.report.loadFailed")}</h1>
        {notFound
          ? <p
            className="mt-1 text-sm text-muted-foreground">{t(
              notFinished ? "tasks.report.notFinishedHint" : "tasks.report.notAvailableHint")}</p>
          : null}
        <div className="mt-6 flex gap-2">
          {!notFound ? (
            <Button variant="outline" onClick={() => query.refetch()}>
              <RefreshCw className="mr-1.5 size-4" />
              {t("tasks.report.retry")}
            </Button>
          ) : null}
          <Button
            onClick={() => router.push(
              notFound ? "/tasks" : `/tasks/${id}`)}>{notFound ? t("tasks.page.heading") : t("tasks.report.back")}</Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <InvoiceTopBar
        title={report?.header.title ?? t("tasks.report.title")}
        subtitle={report ? `${t("tasks.report.title")} · ${report.header.reference}` : undefined}
        onBack={back}>
        <CopySwitch copy={copy} onChange={setCopy} />
        <Button size="sm" className="h-8" onClick={download} disabled={!report || building || query.isFetching}>
          {building ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Download className="mr-1.5 size-4" />}
          <span className="hidden sm:inline">
            {building
              ? progress && progress.total > 0 && progress.done < progress.total
                ? t("tasks.report.preparingPhotos", { done: progress.done, total: progress.total })
                : t("tasks.report.preparing")
              : t("tasks.report.download")}
          </span>
        </Button>
      </InvoiceTopBar>

      <InvoiceWorkbench
        rail={
          <>
            {report ? (
              <IssuerPicker
                issuers={report.meta.issuers ?? []}
                value={issuer}
                defaultId={report.meta.issuerDefaultId ?? null}
                onChange={chooseIssuer}
              />
            ) : null}
            {headAvailable ? <HeadSwitches available={headAvailable} off={headOff} onToggle={toggleHead} /> : null}
            <ReportRail
              copy={copy}
              available={available}
              off={off}
              onToggle={toggle}
              include={include}
              onInclude={setIncluded}
              canIncludeRoute={canViewTracking}
            />
          </>
        }
      >
        {report ? (
          <div className={query.isFetching && query.isPlaceholderData ? "opacity-60 transition-opacity" : undefined}>
            <ReportSheet report={report} visible={visible} showPrices={prices} generatedBy={generatedBy} headOff={headOff} />
          </div>
        ) : (
          <ReportSheetSkeleton />
        )}
      </InvoiceWorkbench>
    </div>
  )
}
