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

/*
  The mistake this file was written about, caught in the source rather than
  explained after the fact.

  `hasPlanFeature` opens with `if (!isAddOn(feature)) return false`, so asking it
  about a MODULE answers no for every organization — including the ones paying
  for that module. It is not a wrong answer, it is the wrong question, and it is
  invisible: the feature simply never appears and nothing says why. Custom fields
  were hidden in the New Task dialog for everybody on exactly this.
*/
describe("no module is asked the add-on question", () => {
  const { readFileSync, readdirSync, statSync } = require("fs") as typeof import("fs")
  const { join } = require("path") as typeof import("path")
  const { AVAILABLE_MODULES } = require("@hbcfield/shared/client") as { AVAILABLE_MODULES: Array<{ key: string }> }

  const SRC = join(__dirname, "..", "..")
  const files: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === "node_modules" || e === ".next" || e === "__tests__") continue
      const full = join(dir, e)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(full)) files.push(full)
    }
  }
  walk(SRC)

  it("never passes a module key to hasPlanFeature or PlanGate", () => {
    const offenders: string[] = []
    for (const f of files) {
      /*
        Comments stripped first.

        Without this the scanner matches the note explaining the bug it is
        guarding against — a test that fails on its own documentation, which is
        how a real finding gets buried under a false one.
      */
      const src = readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ \t]*\/\/.*$/gm, "")
      for (const { key } of AVAILABLE_MODULES) {
        if (src.includes(`hasPlanFeature("${key}")`) || src.includes(`PlanGate feature="${key}"`)) {
          offenders.push(`${key} in ${f.slice(SRC.length + 1)}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
