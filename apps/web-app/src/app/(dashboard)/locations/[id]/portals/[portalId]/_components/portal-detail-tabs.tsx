"use client"

import { Plus, Trash2, Ticket, Pencil, Inbox, Users, ListChecks, ChevronRight } from "lucide-react"
import { type Customer, type PortalRequestView } from "@/lib/api"
import { portalTile } from "@/lib/portal-ui"
import { personInitials } from "@hbcfield/shared/client"
import { getPriorityConfig } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsContent } from "@/components/ui/tabs"
import { STATUS_TONE, TabTrigger, Panel, EmptyState, Loading } from "./portal-detail-page-helpers"
import type { PortalDetailPageState } from "../_hooks/use-portal-detail-page"
import { toneChip } from "@/lib/status-tones"

/** Part of the parent component's markup, moved here unchanged; it reads the state from `vm`. */
export function PortalDetailTabs({ vm }: { vm: PortalDetailPageState }) {
  const {
    t,
    requestCount,
    clientCount,
    mayManage,
    mayInvite,
    setInviteOpen,
    categories,
    requestsQ,
    mayAnswer,
    openTriage,
    router,
    residentsQ,
    setClientToRemove,
    openNewCat,
    openEditCat,
    setCatRemove,
  } = vm
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
            {requestsQ.isLoading ? (
              <Loading />
            ) : requestCount === 0 ? (
              <EmptyState
                icon={<Inbox className="h-6 w-6" />}
                title={t("portal.noRequestsTitle", "No requests yet")}
                hint={t("portal.noRequests", "They appear here as clients submit from the app.")}
              />
            ) : (
              <div className="divide-y divide-border/60">
                {requestsQ.data!.map((r: PortalRequestView) => {
                  const pending = r.triaged === false
                  return (
                    <button
                      key={r.id}
                      className={
                        "w-full flex items-center gap-4 px-5 py-3.5 hover:bg-accent/30 " + "transition-colors text-left"
                      }
                      onClick={() => (pending ? mayAnswer && openTriage(r) : router.push(`/tasks/${r.id}`))}
                    >
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${r.priority ? "" : "bg-slate-400"}`}
                        style={r.priority ? { backgroundColor: getPriorityConfig(r.priority).hex } : undefined}
                        title={r.priority ? getPriorityConfig(r.priority).label : undefined}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          <span className="font-mono">{r.reference}</span>
                          {r.customerName ? ` · ${r.customerName}` : ""}
                          {r.unitName ? ` · ${r.unitName}` : ""}
                          {!pending && r.spaceName ? ` · ${r.spaceName}` : ""}
                        </p>
                      </div>
                      {pending ? (
                        <span
                          className={
                            "inline-flex items-center gap-1 text-[11px] font-semibold rounded-full " +
                            "px-2.5 py-1 shrink-0 bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          }
                        >
                          <Inbox className="h-3 w-3" />
                          {t("portal.pendingTriage", "Route it")}
                        </span>
                      ) : (
                        <span
                          className={
                            `text-[11px] font-semibold capitalize rounded-full px-2.5 py-1 shrink-0 ` +
                            toneChip(STATUS_TONE[r.status] ?? "neutral")
                          }
                        >
                          {r.status.replace(/_/g, " ").toLowerCase()}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </Panel>
        </TabsContent>

        {/* ── Clients ── */}
        <TabsContent value="clients" className="mt-4">
          <div className="flex justify-end mb-3">
            {mayInvite && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setInviteOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                {t("portal.inviteResident", "Invite client")}
              </Button>
            )}
          </div>
          <Panel>
            {residentsQ.isLoading ? (
              <Loading />
            ) : clientCount === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title={t("portal.noResidentsTitle", "No clients yet")}
                hint={t("portal.noResidents", "Invite one — they get a code to sign in on the app.")}
                cta={
                  mayInvite ? (
                    <Button size="sm" className="gap-1.5" onClick={() => setInviteOpen(true)}>
                      <Ticket className="h-4 w-4" />
                      {t("portal.inviteResident", "Invite client")}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="divide-y divide-border/60">
                {residentsQ.data!.map((r: Customer) => (
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
                      onClick={() => setClientToRemove(r)}
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
              <Button variant="outline" size="sm" className="gap-1.5" onClick={openNewCat}>
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
                    <Button size="sm" className="gap-1.5" onClick={openNewCat}>
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
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditCat(c)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {mayManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                          onClick={() => setCatRemove(c)}
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
