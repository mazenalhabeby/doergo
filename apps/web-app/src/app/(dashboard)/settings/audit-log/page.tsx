"use client"

import { personName } from "@hbcfield/shared/client"
import { keys } from "@/lib/query-keys"
import { PlanGate } from "@/components/plan-gate"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Shield,
  Filter,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import Link from "next/link"
import { useTranslation } from "react-i18next"

import { useAuth } from "@/contexts/auth-context"
import { organizationsApi } from "@/lib/api"
import { auditActionLabel } from "@/lib/audit-labels"
import { cn } from "@/lib/utils"
import { formatTimeAgo } from "@/lib/format-date"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Combobox } from "@/components/ui/combobox"
import { auditDetail, EVENT_COLORS, EVENT_TYPES } from "./page-parts"
import { AuditLogPageInner } from "./audit-log-page-inner"

export default function AuditLogPage() {
  return (
    <PlanGate feature="audit_log">
      <AuditLogPageInner />
    </PlanGate>
  )
}
