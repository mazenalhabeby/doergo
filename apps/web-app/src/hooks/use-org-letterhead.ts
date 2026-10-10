"use client"

import { keys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/contexts/auth-context"
import { legalEntitiesApi, organizationsApi, type OrganizationProfile } from "@/lib/api"
import { letterheadFromLegalEntities, letterheadSourceFor } from "@/lib/org-letterhead"
import { COMPANIES_QUERY_KEY } from "@/components/companies/company-select"

/**
 * The letterhead a document is drawn with — from the source this person may
 * actually read (lib/org-letterhead.ts). Never asks a question that can only 403.
 */
export function useOrgLetterhead(): { data: OrganizationProfile | undefined; isLoading: boolean } {
  const { user, hasPermission } = useAuth()
  const source = letterheadSourceFor(user, hasPermission)

  const profile = useQuery({
    queryKey: keys.organization.profile(),
    queryFn: () => organizationsApi.getProfile(),
    enabled: source === "profile",
    staleTime: 5 * 60_000,
  })
  const entities = useQuery({
    queryKey: COMPANIES_QUERY_KEY,
    queryFn: () => legalEntitiesApi.list(),
    enabled: source === "legal-entities",
    staleTime: 5 * 60_000,
  })

  if (source === "profile") return { data: profile.data, isLoading: profile.isLoading }
  if (source === "legal-entities") {
    return {
      data: entities.data ? letterheadFromLegalEntities(entities.data, user?.organizationName) : undefined,
      isLoading: entities.isLoading,
    }
  }
  return { data: user ? { name: user.organizationName ?? null } : undefined, isLoading: false }
}
