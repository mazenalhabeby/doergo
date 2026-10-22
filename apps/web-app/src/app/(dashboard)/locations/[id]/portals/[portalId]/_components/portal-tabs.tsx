"use client"

import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { Plus, Trash2, Ticket, Pencil, Inbox, Users, ListChecks, ChevronRight } from "lucide-react"
import { type Customer, type PortalIntakeCategory, type PortalRequestView } from "@/lib/api"
import { portalTile } from "@/lib/portal-ui"
import { personInitials } from "@hbcfield/shared/client"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState as SharedEmptyState } from "@/components/ui/empty-state"
import { PortalRequestRow } from "./portal-request-row"

/**
 * The portal's three lists: the requests clients sent (a pending one opens routing, a routed one its task),
 * the clients who have access, and the issue categories they pick from.
 */
export function PortalTabs({
  requests,
  requestsLoading,
  requestCount,
  residents,
  residentsLoading,
  clientCount,
  categories,
  mayManage,
  mayAnswer,
  mayInvite,
  onInvite,
  onTriage,
  onRemoveClient,
  onNewCategory,
  onEditCategory,
  onRemoveCategory,
}: {
  requests: PortalRequestView[] | undefined
  requestsLoading: boolean
  requestCount: number
  residents: Customer[] | undefined
  residentsLoading: boolean
  clientCount: number
  categories: PortalIntakeCategory[]
  mayManage: boolean
  mayAnswer: boolean
  mayInvite: boolean
  onInvite: () => void
  onTriage: (request: PortalRequestView) => void
  onRemoveClient: (client: Customer) => void
  onNewCategory: () => void
  onEditCategory: (category: PortalIntakeCategory) => void
  onRemoveCategory: (category: PortalIntakeCategory) => void
}) {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <>
      <Tabs defaultValue="requests" className="w-full">
        <TabsList className="h-11 p-1">
          <TabTrigger value="requests" label={t("portal.tabRequests", "Requests")} count={requestCount} />
          <TabTrigger value="clients" label={t("portal.tabClients", "Clients")} count={clientCount} />
          <TabTrigger value="categories" label={t("portal.tabCategories", "Categories")} count={categories.length} />
        </TabsList>

        {/* ── Requests ── */}
        <TabsContent value="requests" className="mt-4">
          <Panel>
            {requestsLoading ? (
              <Loading />
            ) : requestCount === 0 ? (
              <EmptyState
                icon={<Inbox className="h-6 w-6" />}
                title={t("portal.noRequestsTitle", "No requests yet")}
                hint={t("portal.noRequests", "They appear here as clients submit from the app.")}
              />
            ) : (
              <div className="divide-y divide-border/60">
                {requests!.map((r: PortalRequestView) => (
                  <PortalRequestRow
                    key={r.id}
                    request={r}
                    onOpen={() => (r.triaged === false ? mayAnswer && onTriage(r) : router.push(`/tasks/${r.id}`))}
                  />
                ))}
              </div>
            )}
          </Panel>
        </TabsContent>

        {/* ── Clients ── */}
        <TabsContent value="clients" className="mt-4">
          <div className="flex justify-end mb-3">
            {mayInvite && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={onInvite}>
                <Plus className="h-3.5 w-3.5" />
                {t("portal.inviteResident", "Invite client")}
              </Button>
            )}
          </div>
          <Panel>
            {residentsLoading ? (
              <Loading />
            ) : clientCount === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title={t("portal.noResidentsTitle", "No clients yet")}
                hint={t("portal.noResidents", "Invite one — they get a code to sign in on the app.")}
                cta={
                  mayInvite ? (
                    <Button size="sm" className="gap-1.5" onClick={onInvite}>
                      <Ticket className="h-4 w-4" />
                      {t("portal.inviteResident", "Invite client")}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="divide-y divide-border/60">
                {residents!.map((r: Customer) => (
                  <div
                    key={r.id}
                    className="group flex items-center gap-2 px-5 py-3.5 hover:bg-accent/30 transition-colors"
                  >
                    <button
                      className="flex min-w-0 flex-1 items-center gap-4 text-left"
                      onClick={() => router.push(`/clients/${r.id}`)}
                    >
                      <div
                        className={
                          "h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center " +
                          "justify-center shrink-0 text-sm font-semibold"
                        }
                      >
                        {personInitials(r.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                        {r.email && <p className="text-xs text-muted-foreground truncate">{r.email}</p>}
                      </div>
                    </button>
                    <button
                      onClick={() => onRemoveClient(r)}
                      aria-label={t("portal.removeClient", "Remove client")}
                      className={
                        "shrink-0 rounded-lg p-2 text-muted-foreground opacity-0 transition-all " +
                        "hover:bg-red-500/10 hover:text-red-600 focus:opacity-100 " +
                        "group-hover:opacity-100"
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </TabsContent>

        {/* ── Categories ── */}
        <TabsContent value="categories" className="mt-4">
          <div className="flex justify-end mb-3">
            {mayManage && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={onNewCategory}>
                <Plus className="h-3.5 w-3.5" />
                {t("portal.addCategory", "Add category")}
              </Button>
            )}
          </div>
          <Panel>
            {categories.length === 0 ? (
              <EmptyState
                icon={<ListChecks className="h-6 w-6" />}
                title={t("portal.noCategoriesTitle", "No categories yet")}
                hint={t("portal.noCategories", "Add a category so clients can classify what they report.")}
                cta={
                  mayManage ? (
                    <Button size="sm" className="gap-1.5" onClick={onNewCategory}>
                      <Plus className="h-4 w-4" />
                      {t("portal.addCategory", "Add category")}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="divide-y divide-border/60">
                {categories.map((c) => (
                  <div key={c.id} className="group flex items-center gap-4 px-5 py-3.5">
                    <div
                      className={
                        `h-10 w-10 rounded-lg flex items-center justify-center shrink-0 text-xs ` +
                        `font-semibold ${portalTile(c.color)}`
                      }
                    >
                      {personInitials(c.label)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                        {c.label}
                        {c.urgent && (
                          <span
                            className={
                              "text-[10px] font-semibold rounded-full bg-red-500/10 text-red-600 " +
                              "dark:text-red-400 px-1.5 py-0.5"
                            }
                          >
                            URGENT
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {(c.issues || []).join(" · ") || t("portal.noIssues", "no sub-issues")}
                        {c.team ? ` — ${c.team}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {mayManage && (
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onEditCategory(c)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {mayManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                          onClick={() => onRemoveCategory(c)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </TabsContent>
      </Tabs>
    </>
  )
}

function TabTrigger({ value, label, count }: { value: string; label: string; count: number }) {
  return (
    <TabsTrigger value={value} className="rounded-md data-[state=active]:shadow-sm">
      {label}
      {count > 0 && (
        <span className="ml-1.5 rounded-full bg-foreground/10 px-1.5 text-[11px] font-semibold tabular-nums">
          {count}
        </span>
      )}
    </TabsTrigger>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card overflow-hidden">{children}</div>
}

function EmptyState({
  icon,
  title,
  hint,
  cta,
}: {
  icon: React.ReactNode
  title: string
  hint: string
  cta?: React.ReactNode
}) {
  // The shared empty state, a little inset because it sits inside a panel.
  return <SharedEmptyState icon={icon} title={title} description={hint} action={cta} className="m-4" />
}

function Loading() {
  return <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
}
