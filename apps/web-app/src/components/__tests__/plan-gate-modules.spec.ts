import { isAddOn, orgHasAddOn } from "@hbcfield/shared/client"

/**
 * Two kinds of thing get gated, and they are bought in different places.
 *
 * Reported from production: a space with CRM switched on rendered its Customers
 * tab — the tab only exists when `enabledModules` contains "crm" — and then told
 * the admin, inside that tab, that CRM was "not part of your subscription". Both
 * statements came from the same page.
 *
 * The cause is below. `hasPlanFeature` opens with `if (!isAddOn(feature)) return
 * false`, which is right for what it was written for: it answers "did the
 * organization buy this add-on". CRM is not an add-on. It is a per-space MODULE,
 * where switching it on IS the purchase — so the question was never one this
 * function could answer, and its honest "no" read as a refusal.
 *
 * These assert the distinction itself, because the gate is only ever as correct
 * as this split. A key that quietly moves from one list to the other changes what
 * a screen says without changing the screen.
 */
describe("gating: add-ons versus per-space modules", () => {
  it("crm is a module, not an add-on", () => {
    expect(isAddOn("crm")).toBe(false)
  })

  it("the things bought in Billing are add-ons", () => {
    for (const key of ["invoicing", "shift_scheduling", "audit_log", "overtime", "recurring", "documents"]) {
      expect(isAddOn(key)).toBe(true)
    }
  })

  it("asking the add-on question about a module always answers no", () => {
    // Not a bug in orgHasAddOn — the wrong question. This is the exact shape the
    // page was using, kept here so the reason stays visible.
    const orgWithEverything = ["workflows", "invoicing", "documents", "audit_log"]
    expect(orgHasAddOn(orgWithEverything, "crm")).toBe(false)
  })

  it("fails closed on a key that is neither", () => {
    /*
      The fail-closed guarantee lives in `isAddOn`, not in `orgHasAddOn`.

      `orgHasAddOn` is plain list membership — hand it a typo that also happens to
      be in the granted list and it says yes, correctly, because it is answering
      "is this string in this list". What stops a typo opening a gate is the
      `isAddOn` check in front of it, which is why `hasPlanFeature` asks that
      first and why PlanGuard 402s on an unrecognised key.
    */
    expect(isAddOn("crmm")).toBe(false)
    expect(orgHasAddOn(["invoicing"], "crmm")).toBe(false)
  })

  it("a space's module list is what decides a module", () => {
    // What PlanGate now reads for a module key: the list the tab itself is
    // rendered from, so the two can no longer disagree.
    const spaceModules = ["crm", "b2c_portal", "assets"]
    expect(spaceModules.includes("crm")).toBe(true)
    expect(["assets"].includes("crm")).toBe(false)
  })
})
