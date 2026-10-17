"use client"

import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

/** CreateInvitationDialog's module-level helpers, moved here unchanged so its sections can read them too. */
// Only an external invitation draws the builder — not loaded until one is.
export const PermissionBuilder = dynamic(
  () => import("@/components/permissions/permission-builder").then((m) => m.PermissionBuilder),
  { loading: () => <Skeleton className="h-64 w-full" /> },
)
