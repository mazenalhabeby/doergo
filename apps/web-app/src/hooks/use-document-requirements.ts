"use client"

import { useQuery } from "@tanstack/react-query"
import { documentsApi } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { summarisePending } from "@hbcfield/shared/client"
import { keys } from "@/lib/query-keys"
import { useAfterFirstLoad } from "@/hooks/use-after-first-load"

/**
 * What the signed-in person still has to do about their own documents.
 *
 * UPLOADS ONLY on the web, deliberately.
 *
 * The endpoint returns both kinds — types to supply, and documents already
 * issued that are waiting for a signature — and the mobile reminder shows both.
 * The web summary counts only the uploads: signing here has its own route and
 * its own place on the personnel-file page, and a nudge duplicating a thing the
 * screen already presents is a nudge people learn to skip past.
 *
 * `toSign` is still returned raw, unsummarised, for anything that wants it.
 * Feeding it to the summary is a ONE-WORD change, which is the point of keeping
 * the rule shared rather than writing a second, web-only one.
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
export function useMyDocumentRequirements({
  withPage = false,
  when = true,
}: {
  withPage?: boolean
  /** Ask at all — the sidebar asks only when it offers My documents. */
  when?: boolean
} = {}) {
  const { user, hasPlanFeature } = useAuth()
  /*
    The navbar's count waits until the page has loaded (useAfterFirstLoad); the
    dashboard's banner (`withPage`) is part of what that page shows, so it goes
    out with it — and the count then reads the same cached reply.
  */
  const afterFirstLoad = useAfterFirstLoad(1)
  const enabled = when && !!user && hasPlanFeature("documents") && (withPage || afterFirstLoad)

  const { data } = useQuery({
    queryKey: keys.documents.myPending(),
    queryFn: () => documentsApi.pending(),
    enabled,
    staleTime: 5 * 60 * 1000,
  })

  const toUpload = data?.toUpload ?? []
  const toSign = data?.toSign ?? []
  const expiring = data?.expiring ?? []

  // The same pure rule the mobile card uses — fed a different set, not a
  // different rule, so the phrasing and the counting stay in one place.
  return {
    ...summarisePending({ toUpload, toSign: [], expiring }),
    toUpload,
    toSign,
    expiring,
  }
}
