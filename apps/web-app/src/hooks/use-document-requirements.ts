"use client"

import { useQuery } from "@tanstack/react-query"
import { documentsApi } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { summarisePending } from "@hbcfield/shared/client"

/**
 * What the signed-in person still has to do about their own documents.
 *
 * Both kinds in ONE request: types the organization asks them to supply, and
 * documents already issued to them that are waiting for a signature. Those live
 * in different tables with different lifecycles, and a reminder that knows about
 * only one of them is worse than none, because it reads as a complete statement
 * of what is left.
 *
 * Gated on the add-on before the query is enabled, so an organization that has
 * not bought Member Documents issues no request at all — a reminder for a
 * feature nobody owns must not appear in their network tab.
 *
 * Five minutes stale because requirements move when an admin verifies something
 * or a certificate ages out — neither happens while somebody watches, and a
 * reminder that refetches on every navigation is a reminder that gets blamed for
 * the dashboard feeling slow.
 */
export function useMyDocumentRequirements() {
  const { user, hasPlanFeature } = useAuth()
  const enabled = !!user && hasPlanFeature("documents")

  const { data } = useQuery({
    queryKey: ["my-pending-documents"],
    queryFn: () => documentsApi.pending(),
    enabled,
    staleTime: 5 * 60 * 1000,
  })

  const toUpload = data?.toUpload ?? []
  const toSign = data?.toSign ?? []
  const expiring = data?.expiring ?? []

  // The same pure rule the mobile card uses, so the two can never quote
  // different numbers for the same person.
  return {
    ...summarisePending({ toUpload, toSign, expiring }),
    toUpload,
    toSign,
    expiring,
  }
}
