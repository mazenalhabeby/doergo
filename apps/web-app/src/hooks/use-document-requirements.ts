"use client"

import { useQuery } from "@tanstack/react-query"
import { documentsApi } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { waitingOnMember } from "@hbcfield/shared/client"

/**
 * What the signed-in person still owes their organization.
 *
 * The same query key the personnel-file page uses, so opening that page after
 * seeing the reminder costs nothing — TanStack serves both from one cache entry
 * rather than fetching twice for the same answer.
 *
 * Gated on the add-on before the query is enabled: an organization that has not
 * bought Member Documents issues no request at all. A reminder for a feature
 * nobody owns must not appear in their network tab.
 *
 * Five minutes stale because requirements move when an admin verifies something
 * or a certificate ages out — neither happens while somebody watches, and a
 * reminder that refetches on every navigation is a reminder that gets blamed
 * for the dashboard feeling slow.
 */
export function useMyDocumentRequirements() {
  const { user, hasPlanFeature } = useAuth()
  const enabled = !!user && hasPlanFeature("documents")

  const { data = [] } = useQuery({
    queryKey: ["my-document-requirements"],
    queryFn: () => documentsApi.requirements(),
    enabled,
    staleTime: 5 * 60 * 1000,
  })

  const actionable = data.filter((r) => waitingOnMember(r))
  const expiringSoon = data.filter((r) => r.state === "EXPIRING")

  return {
    actionable,
    expiringSoon,
    /** At least one outstanding requirement stops them being given work. */
    blocksWork: actionable.some((r) => r.blocksWork),
    count: actionable.length,
  }
}
