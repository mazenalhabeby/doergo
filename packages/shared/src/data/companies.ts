/**
 * Published reads of auth-service's legal companies (`LegalEntity`) — see db.ts. Owner: auth-service.
 */
import type { On } from './db';

/** The issuing company's letterhead fields — never its bank, never its rates. */
export const ISSUER_SELECT = {
  id: true,
  isMain: true,
  legalName: true,
  label: true,
  addressLine1: true,
  addressLine2: true,
  postalCode: true,
  city: true,
  state: true,
  country: true,
  vatId: true,
  taxId: true,
  registerNumber: true,
  email: true,
  phone: true,
  website: true,
  logoUrl: true,
  currency: true,
} as const;

/** The organization's active companies as a document's letterhead reads them. */
export function activeIssuers(db: On<'legalEntity', 'findMany'>, organizationId: string) {
  return db.legalEntity.findMany({ where: { organizationId, isActive: true }, select: ISSUER_SELECT });
}
