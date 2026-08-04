"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Building2, Loader2, ShieldAlert } from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { locationsApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PlanGate } from "@/components/plan-gate"

import { GeneralTab } from "./_components/general-tab"
import { WorkModelTab } from "./_components/work-model-tab"
import { ShiftsTab } from "./_components/shifts-tab"
import { RotaTab } from "./_components/rota-tab"
import { ModulesTab } from "./_components/modules-tab"
import { WorkflowTab } from "./_components/workflow-tab"
import { MembersTab } from "./_components/members-tab"

export default function SpaceSettingsPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useParams()
  const spaceId = params.id as string
  const { user } = useAuth()
  const canManage = !!user?.canManageUsers

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
            <div className="rounded-xl bg-muted/50 p-2.5">
              <Building2 className="h-5 w-5 text-muted-foreground" />
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
              <TabsTrigger value="general">{t("locations.tabs.general")}</TabsTrigger>
              <TabsTrigger value="work-model">{t("scheduling.tabs.workModel")}</TabsTrigger>
              <TabsTrigger value="shifts">{t("scheduling.tabs.shifts")}</TabsTrigger>
              <TabsTrigger value="rota">{t("scheduling.tabs.rota")}</TabsTrigger>
              <TabsTrigger value="modules">{t("locations.tabs.modules")}</TabsTrigger>
              <TabsTrigger value="workflow">{t("locations.tabs.workflow")}</TabsTrigger>
              <TabsTrigger value="members">{t("scheduling.tabs.members")}</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="mt-6">
              <GeneralTab space={space} />
            </TabsContent>

            {/* Attendance / scheduling is a Professional+ capability. Under-tier
                orgs see an upgrade panel here; the API enforces the same 402. */}
            <TabsContent value="work-model" className="mt-6">
              <PlanGate feature="shift_scheduling">
                <WorkModelTab space={space} />
              </PlanGate>
            </TabsContent>
            <TabsContent value="shifts" className="mt-6">
              <PlanGate feature="shift_scheduling">
                <ShiftsTab spaceId={spaceId} />
              </PlanGate>
            </TabsContent>
            <TabsContent value="rota" className="mt-6">
              <PlanGate feature="shift_scheduling">
                <RotaTab spaceId={spaceId} />
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
          </Tabs>
        )}
      </div>
    </div>
  )
}
