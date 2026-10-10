/**
 * The organization's letterhead (name, address, logo) for a document — who may
 * read it from where.
 *
 * ⚠️ `GET /organizations/profile` is `@Roles(ADMIN)`. Invoices and reports read it
 * for their letterhead, so for anybody who manages invoices without being an admin
 * it 403'd and the document lost its sender. `GET /legal-entities` answers the
 * same identity for whoever invoices or chooses who invoices (canManageInvoices,
 * canManageWorkspaces, crmEditInfo, crmManageClients — external members refused),
 * and the MAIN company is the organization's own name on paper. Everybody else
 * gets the organization's name, which is already on their session.
 */
import { isAdmin } from "@hbcfield/shared/client"
import type { LegalEntity, OrganizationProfile } from "@/lib/api"

type LetterheadSource = "profile" | "legal-entities" | "session"

/** The permissions the gateway accepts on `GET /legal-entities` (READ_KEYS there). */
export const LEGAL_ENTITY_READ_KEYS = ["canManageInvoices", "canManageWorkspaces", "crmEditInfo", "crmManageClients"] as const

export function letterheadSourceFor(
  user: { role?: string; isExternal?: boolean } | null | undefined,
  hasPermission: (perm: string) => boolean,
): LetterheadSource {
  if (!user) return "session"
  if (isAdmin({ role: user.role ?? "" })) return "profile"
  if (user.isExternal) return "session"
  return LEGAL_ENTITY_READ_KEYS.some((k) => hasPermission(k)) ? "legal-entities" : "session"
}

/** The main (else first active) company as the profile-shaped letterhead documents read. */
export function letterheadFromLegalEntities(
  entities: LegalEntity[] | null | undefined,
  fallbackName?: string | null,
): OrganizationProfile {
  const list = entities ?? []
  const e = list.find((x) => x.isMain && x.isActive !== false) ?? list.find((x) => x.isActive !== false) ?? list[0]
  if (!e) return { name: fallbackName ?? null }
  return {
    name: e.legalName || fallbackName || null,
    logoUrl: e.logoUrl,
    addressLine1: e.addressLine1,
    addressLine2: e.addressLine2,
    postalCode: e.postalCode,
    city: e.city,
    state: e.state,
    country: e.country,
    vatId: e.vatId,
    email: e.email,
    phone: e.phone,
    website: e.website,
  }
}
