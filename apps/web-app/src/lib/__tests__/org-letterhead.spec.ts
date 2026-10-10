import { letterheadFromLegalEntities, letterheadSourceFor } from "@/lib/org-letterhead"
import type { LegalEntity } from "@/lib/api"

const entity = (over: Partial<LegalEntity>): LegalEntity =>
  ({
    id: "e", legalName: "HBC GmbH", label: null, addressLine1: "Street 1", addressLine2: null, postalCode: "4663",
    city: "Laakirchen", state: null, country: "AT", vatId: "ATU1", taxId: null, registerNumber: null,
    email: "office@hbc.at", phone: "+43", website: "hbc.at", logoUrl: "/logo.png", currency: "EUR",
    invoicePrefix: "INV", isMain: false, isActive: true, ...over,
  }) as LegalEntity

describe("where the letterhead is read from", () => {
  const none = () => false
  it("an admin reads the organization profile", () => {
    expect(letterheadSourceFor({ role: "ADMIN" }, none)).toBe("profile")
  })
  it("whoever invoices (or picks who invoices) reads the companies — the profile would 403", () => {
    for (const k of ["canManageInvoices", "canManageWorkspaces", "crmEditInfo", "crmManageClients"]) {
      expect(letterheadSourceFor({ role: "EMPLOYEE" }, (p) => p === k)).toBe("legal-entities")
    }
  })
  it("an external member, or anybody else, gets the name on their session", () => {
    expect(letterheadSourceFor({ role: "EMPLOYEE", isExternal: true }, () => true)).toBe("session")
    expect(letterheadSourceFor({ role: "EMPLOYEE" }, none)).toBe("session")
    expect(letterheadSourceFor(null, () => true)).toBe("session")
  })
})

describe("the main company as the letterhead", () => {
  it("maps the main company onto the profile shape documents draw", () => {
    const out = letterheadFromLegalEntities([entity({ id: "a", legalName: "Other Inc." }), entity({ id: "m", isMain: true })])
    expect(out).toEqual({
      name: "HBC GmbH", logoUrl: "/logo.png", addressLine1: "Street 1", addressLine2: null, postalCode: "4663",
      city: "Laakirchen", state: null, country: "AT", vatId: "ATU1", email: "office@hbc.at", phone: "+43", website: "hbc.at",
    })
  })
  it("falls back to the first active company, then to the organization's name", () => {
    expect(letterheadFromLegalEntities([entity({ isActive: false, legalName: "Old" }), entity({ legalName: "Live" })]).name).toBe("Live")
    expect(letterheadFromLegalEntities([], "Acme")).toEqual({ name: "Acme" })
    expect(letterheadFromLegalEntities(undefined)).toEqual({ name: null })
  })
})
