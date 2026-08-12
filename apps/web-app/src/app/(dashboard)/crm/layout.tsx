"use client";

import { PlanGate } from "@/components/plan-gate";
import { CrmTabs } from "./_components/crm-tabs";

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlanGate feature="crm">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-foreground">Sales</h1>
          <p className="text-sm text-muted-foreground">
            Leads, deal pipeline, quotes, route planning and commissions.
          </p>
        </div>
        <CrmTabs />
        <div className="pt-6">{children}</div>
      </div>
    </PlanGate>
  );
}
