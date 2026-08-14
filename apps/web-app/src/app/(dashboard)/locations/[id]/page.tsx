"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowLeft,
  Blocks,
  Building2,
  CalendarClock,
  FileText,
  Contact,
  Home,
  Loader2,
  Share2,
  ShieldAlert,
  UserCog,
  Workflow,
} from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { locationsApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PlanGate } from "@/components/plan-gate"

import { GeneralTab } from "./_components/general-tab"
import { AttendanceTab } from "./_components/attendance-tab"
import { ModulesTab } from "./_components/modules-tab"
import { WorkflowTab } from "./_components/workflow-tab"
import { MembersTab } from "./_components/members-tab"
import { InvoicesTab } from "./_components/invoices-tab"
import { CustomersTab } from "./_components/customers-tab"
import { PortalTab } from "./_components/portal-tab"
import { ApartmentsTab } from "./_components/apartments-tab"
import { SharingTab } from "./_components/sharing-tab"

export default function SpaceSettingsPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useParams()
  const spaceId = params.id as string
  const { user } = useAuth()
  // Org-wide managers OR the space's own manager (per-space canManageUsers, from
  // their space-role) may open this space's settings (delegation).
  const canManage =
    !!user?.canManageUsers ||
    (user as any)?.access?.org?.canManageUsers === true ||
    (user as any)?.access?.perSpace?.[spaceId]?.canManageUsers === true

  const [activeTab, setActiveTab] = useState("general")

  const { data: space, isLoading } = useQuery({
    queryKey: ["location", spaceId],
    queryFn: () => locationsApi.getById(spaceId),
    enabled: !!spaceId && canManage,
  })

  // Gate the whole page on the user-management permission (mirrors other admin pages).
  if (!canManage) {
    return (
      <div className="min-h-full bg-background">
        <div className="max-w-[1100px] mx-auto px-6 py-6">
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="rounded-2xl bg-muted/50 p-5 mb-5">
              <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">{t("scheduling.unauthorized.title")}</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              {t("scheduling.unauthorized.description")}
            </p>
            <Button variant="outline" className="mt-6" onClick={() => router.push("/locations")}>
              {t("scheduling.backToSpaces")}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-[1100px] mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => router.push("/locations")}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("scheduling.backToSpaces")}
          </button>
          <div className="mt-3 flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">
                {isLoading ? t("common.loading") : space?.name || t("scheduling.title")}
              </h1>
              <p className="text-sm text-muted-foreground">{t("scheduling.subtitle")}</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !space ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <h3 className="text-lg font-semibold text-foreground">{t("scheduling.notFound.title")}</h3>
            <p className="text-sm text-muted-foreground mt-2">{t("scheduling.notFound.description")}</p>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="inline-flex h-auto flex-wrap justify-start gap-1">
              <TabsTrigger value="general" className="gap-1.5">
                <Building2 className="h-4 w-4" />
                {t("locations.tabs.general")}
              </TabsTrigger>
              <TabsTrigger value="attendance" className="gap-1.5">
                <CalendarClock className="h-4 w-4" />
                {t("scheduling.tabs.attendance")}
              </TabsTrigger>
              <TabsTrigger value="modules" className="gap-1.5">
                <Blocks className="h-4 w-4" />
                {t("locations.tabs.modules")}
              </TabsTrigger>
              <TabsTrigger value="workflow" className="gap-1.5">
                <Workflow className="h-4 w-4" />
                {t("locations.tabs.workflow")}
              </TabsTrigger>
              <TabsTrigger value="members" className="gap-1.5">
                <UserCog className="h-4 w-4" />
                {t("scheduling.tabs.members")}
              </TabsTrigger>
              {/* Cross-org space sharing — available to anyone who can manage the space. */}
              <TabsTrigger value="sharing" className="gap-1.5">
                <Share2 className="h-4 w-4" />
                {t("spaceSharing.tabTitle")}
              </TabsTrigger>
              {/* Customers tab only when the space has the CRM module on. */}
              {space?.enabledModules?.includes("crm") && (
                <TabsTrigger value="customers" className="gap-1.5">
                  <Contact className="h-4 w-4" />
                  {t("customers.title", "Customers")}
                </TabsTrigger>
              )}
              {/* Apartments tab only when the space has the Apartments module on. */}
              {space?.enabledModules?.includes("apartments") && (
                <TabsTrigger value="apartments" className="gap-1.5">
                  <Home className="h-4 w-4" />
                  {t("apartments.title", "Apartments")}
                </TabsTrigger>
              )}
              {/* Portal tab only when the space has the B2C Portal module on. */}
              {space?.enabledModules?.includes("b2c_portal") && (
                <TabsTrigger value="portal" className="gap-1.5">
                  <Building2 className="h-4 w-4" />
                  {t("portal.title", "Client portal")}
                </TabsTrigger>
              )}
              {/* Invoices tab only for CUSTOMER-kind spaces (customer companies). */}
              {space?.kind === "CUSTOMER" && (
                <TabsTrigger value="invoices" className="gap-1.5">
                  <FileText className="h-4 w-4" />
                  {t("invoices.title")}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="general" className="mt-6">
              <GeneralTab space={space} />
            </TabsContent>

            {/* Attendance / scheduling is a Professional+ capability. Under-tier
                orgs see an upgrade panel here; the API enforces the same 402. */}
            <TabsContent value="attendance" className="mt-6">
              <PlanGate feature="shift_scheduling">
                <AttendanceTab space={space} />
              </PlanGate>
            </TabsContent>

            <TabsContent value="modules" className="mt-6">
              <ModulesTab space={space} />
            </TabsContent>
            <TabsContent value="workflow" className="mt-6">
              <WorkflowTab space={space} />
            </TabsContent>
            <TabsContent value="members" className="mt-6">
              <MembersTab spaceId={spaceId} />
            </TabsContent>
            <TabsContent value="sharing" className="mt-6">
              <SharingTab spaceId={spaceId} spaceName={space.name} />
            </TabsContent>
            {space?.enabledModules?.includes("crm") && (
              <TabsContent value="customers" className="mt-6">
                <PlanGate feature="crm">
                  <CustomersTab space={space} />
                </PlanGate>
              </TabsContent>
            )}
            {space?.enabledModules?.includes("apartments") && (
              <TabsContent value="apartments" className="mt-6">
                <PlanGate feature="crm">
                  <ApartmentsTab spaceId={spaceId} hasB2C={!!space?.enabledModules?.includes("b2c_portal")} />
                </PlanGate>
              </TabsContent>
            )}
            {space?.enabledModules?.includes("b2c_portal") && (
              <TabsContent value="portal" className="mt-6">
                <PlanGate feature="crm">
                  <PortalTab spaceId={spaceId} />
                </PlanGate>
              </TabsContent>
            )}
            {space?.kind === "CUSTOMER" && (
              <TabsContent value="invoices" className="mt-6">
                <PlanGate feature="invoicing">
                  <InvoicesTab spaceId={spaceId} spaceName={space.name} />
                </PlanGate>
              </TabsContent>
            )}
          </Tabs>
        )}
      </div>
    </div>
  )
}
