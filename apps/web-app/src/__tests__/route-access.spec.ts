import fs from "fs"
import path from "path"
import {
  ROUTE_RULES,
  SETTINGS_SECTION_RULES,
  checkRoute,
  mayOpen,
  navModelFor,
  defaultSettingsSection,
  resolveSettingsSection,
  settingsSectionsFor,
  routeRuleFor,
  type AccessContext,
  type AccessUser,
} from "@/lib/route-access"
import { NAV_OPTION, SETTINGS_OPTION, ADD_ON_KEYS } from "@hbcfield/shared/client"

/*
  One table decides who may open which page (lib/route-access). These pin it to
  the folder it describes and to the people it is about.
*/

const DASHBOARD = path.join(__dirname, "..", "app", "(dashboard)")

function pageRoutes(dir: string, prefix = ""): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // `_components`, `_lib`: private folders, never routes. `(group)` adds no segment.
      if (entry.name.startsWith("_")) continue
      const seg = /^\(.*\)$/.test(entry.name) ? "" : `/${entry.name}`
      out.push(...pageRoutes(path.join(dir, entry.name), prefix + seg))
    } else if (entry.name === "page.tsx") {
      out.push(prefix || "/")
    }
  }
  return out
}

describe("the route table covers the dashboard, exactly", () => {
  const pages = pageRoutes(DASHBOARD).sort()

  it("finds the pages (sanity)", () => {
    expect(pages.length).toBeGreaterThan(40)
    expect(pages).toContain("/members")
  })

  it("every page has an entry", () => {
    expect(pages.filter((p) => !(p in ROUTE_RULES))).toEqual([])
  })

  it("no entry outlives its page", () => {
    expect(Object.keys(ROUTE_RULES).filter((k) => !pages.includes(k))).toEqual([])
  })

  it("says why for every entry", () => {
    for (const [k, r] of Object.entries(ROUTE_RULES)) expect([k, r.why.length > 10]).toEqual([k, true])
  })

  it("names only Options that exist", () => {
    for (const r of [...Object.values(ROUTE_RULES), ...Object.values(SETTINGS_SECTION_RULES)]) {
      if (r.option) expect(ADD_ON_KEYS).toContain(r.option)
    }
  })

  it("asks the Option table for every nav href and settings section it owns", () => {
    expect(ROUTE_RULES["/invoices"].option).toBe(NAV_OPTION["/invoices"])
    expect(ROUTE_RULES["/overtime"].option).toBe(NAV_OPTION["/overtime"])
    expect(ROUTE_RULES["/employees/availability"].option).toBe(NAV_OPTION["/schedule"])
    expect(SETTINGS_SECTION_RULES["audit-log"].option).toBe(SETTINGS_OPTION["audit-log"])
  })

  it("matches a concrete path to its pattern, literal before [param]", () => {
    expect(routeRuleFor("/members/phone-sync")?.pattern).toBe("/members/phone-sync")
    expect(routeRuleFor("/members/abc-123")?.pattern).toBe("/members/[id]")
    expect(routeRuleFor("/invoices/x/edit")?.pattern).toBe("/invoices/[id]/edit")
    expect(routeRuleFor("/members/")?.pattern).toBe("/members")
    expect(routeRuleFor("/nope")).toBeNull()
  })
})

// ─── People ─────────────────────────────────────────────────────────────────

const ALL_OPTIONS = new Set(ADD_ON_KEYS)
const modules = ["crm", "assets", "b2c_portal"]

function ctx(user: Partial<AccessUser>, options: Set<string> = ALL_OPTIONS): AccessContext {
  return {
    user: { role: "EMPLOYEE", spaceModules: modules, enabledModules: [], ...user } as AccessUser,
    hasOption: (o) => options.has(o),
  }
}

const admin = ctx({ role: "ADMIN" })
/**
 * A manager who reads all work and nothing else. The session's flat fields carry
 * the server's bridges (`orgFlagFields`): org-wide canViewAllTasks also reads assets.
 */
const manager = ctx({ canViewAllTasks: true, canViewAssets: true, access: { org: { canViewAllTasks: true } } })
/** A dispatcher who assigns work and nothing else. */
const dispatcher = ctx({ canAssignTasks: true, access: { org: { canAssignTasks: true } } })
/** An external observer: a SPACE role granting canViewAllTasks + canCreateTasks. */
const observer = ctx({
  isExternal: true,
  access: { org: {}, perSpace: { s1: { canViewAllTasks: true, canCreateTasks: true } } },
})
/** A technician who signed in on the web: no permissions, their own screens. */
const technician = ctx({ enabledModules: ["clock", "time_off"], access: { org: {} } })

const TEAM_PAGES = ["/members", "/members/x", "/invitations", "/join-requests"]
const DOC_ADMIN = ["/documents", "/documents/all", "/documents/review", "/documents/templates", "/documents/types"]

describe("an admin opens everything", () => {
  it.each(Object.keys(ROUTE_RULES).filter((k) => !["/manage", "/my/attendance", "/my/time-off", "/members/phone-sync"].includes(k)))(
    "%s",
    (route) => expect(checkRoute(route.replace(/\[[^\]]+\]/g, "x"), admin)).toEqual({ ok: true }),
  )

  it("still loses an Option the organization did not buy", () => {
    const noInvoicing = ctx({ role: "ADMIN" }, new Set([...ALL_OPTIONS].filter((o) => o !== "invoicing")))
    expect(checkRoute("/invoices", noInvoicing)).toEqual({ ok: false, reason: "option" })
  })
})

describe("a manager with canViewAllTasks only", () => {
  it("is refused every Team page — they all need canManageUsers", () => {
    for (const p of TEAM_PAGES) expect([p, mayOpen(p, manager)]).toEqual([p, false])
  })
  it("is refused the document admin pages", () => {
    for (const p of DOC_ADMIN) expect([p, mayOpen(p, manager)]).toEqual([p, false])
  })
  it("opens what canViewAllTasks reads", () => {
    for (const p of ["/tasks", "/locations", "/assets", "/assets/a1", "/reports", "/shared/s1", "/employees/availability", "/clients"]) {
      expect([p, mayOpen(p, manager)]).toEqual([p, true])
    }
  })
  it("is refused admin-only and invoice pages", () => {
    for (const p of ["/settings/audit-log", "/invoices", "/tasks/recurring", "/attendance"]) {
      expect([p, mayOpen(p, manager)]).toEqual([p, false])
    }
  })
})

describe("a dispatcher with canAssignTasks only", () => {
  it("opens the credential board and nothing of the Team menu", () => {
    expect(mayOpen("/documents/compliance", dispatcher)).toBe(true)
    for (const p of TEAM_PAGES) expect(mayOpen(p, dispatcher)).toBe(false)
  })
  it("is refused what reads all work", () => {
    for (const p of ["/assets", "/reports", "/locations", "/clients"]) expect([p, mayOpen(p, dispatcher)]).toEqual([p, false])
  })
})

describe("an external observer", () => {
  it("is refused what stays the organization's own, whatever they hold", () => {
    for (const p of ["/calendar", "/reports", "/settings/billing", "/employees/availability", "/employees/leave-opening"]) {
      expect([p, checkRoute(p, observer)]).toEqual([p, { ok: false, reason: "external" }])
    }
  })
  it("is refused clients, assets and portals — canViewAllTasks in a workspace grants none of them", () => {
    for (const p of ["/clients", "/customers/c1", "/assets", "/assets/a1", "/portals", "/locations/s1/portals/p1"]) {
      expect([p, checkRoute(p, observer)]).toEqual([p, { ok: false, reason: "permission" }])
    }
    expect(mayOpen("/shared/s1", observer)).toBe(false)
  })
  it("still reaches the work they are there for", () => {
    for (const p of ["/dashboard", "/tasks", "/tasks/t1", "/locations"]) expect([p, mayOpen(p, observer)]).toEqual([p, true])
  })
})

describe("an external member given a workspace by the permission builder", () => {
  const withGrants = (perms: Record<string, boolean>) =>
    ctx({ isExternal: true, access: { org: {}, perSpace: { s1: { canViewAllTasks: true, ...perms } } } })

  it("is offered /clients with crmViewAll in their workspace, and not without it", () => {
    const seesClients = withGrants({ crmViewAll: true })
    expect(mayOpen("/clients", seesClients)).toBe(true)
    expect(mayOpen("/customers/c1", seesClients)).toBe(true)
    expect(navModelFor(seesClients).clients).toBe(true)
    expect(mayOpen("/clients", observer)).toBe(false)
    expect(navModelFor(observer).clients).toBe(false)
  })
  it("never reaches clients through the org-wide legacy bridge — an external holds no org caps", () => {
    const bridged = ctx({ isExternal: true, canViewAllTasks: true, access: { org: { canViewAllTasks: true }, perSpace: {} } })
    expect(mayOpen("/clients", bridged)).toBe(false)
  })
  it("needs the workspace to run the CRM", () => {
    const noCrm = ctx({ isExternal: true, spaceModules: ["assets"], access: { org: {}, perSpace: { s1: { crmViewAll: true } } } })
    // A workspace grant counts only where the workspace runs the CRM (crmReachOf).
    expect(mayOpen("/clients", noCrm)).toBe(false)
  })
  it("is offered assets with canViewAssets there, portals with canViewPortal there", () => {
    const both = withGrants({ canViewAssets: true, canViewPortal: true })
    for (const p of ["/assets", "/assets/a1", "/portals", "/locations/s1/portals/p1"]) expect([p, mayOpen(p, both)]).toEqual([p, true])
    expect(navModelFor(both)).toMatchObject({ assets: true, portals: true })
  })
  it("still never gets the calendar, reports or billing — even holding everything in the workspace", () => {
    const all = withGrants({ crmViewAll: true, canViewAssets: true, canViewPortal: true, canViewReports: true })
    for (const p of ["/calendar", "/reports", "/settings/billing"]) {
      expect([p, checkRoute(p, all)]).toEqual([p, { ok: false, reason: "external" }])
    }
    expect(navModelFor(all).calendar).toBe(false)
  })
})

describe("a technician on the web", () => {
  it("reaches their own screens", () => {
    for (const p of ["/dashboard", "/tasks", "/my/attendance", "/my/time-off", "/my/documents", "/settings", "/calendar"]) {
      expect([p, mayOpen(p, technician)]).toEqual([p, true])
    }
  })
  it("is refused every management page", () => {
    for (const p of [...TEAM_PAGES, ...DOC_ADMIN, "/attendance", "/overtime", "/invoices", "/reports", "/locations", "/employees/new"]) {
      expect([p, mayOpen(p, technician)]).toEqual([p, false])
    }
  })
})

// ─── Settings ───────────────────────────────────────────────────────────────

describe("settings sections", () => {
  it("an admin lands on General and sees every section", () => {
    expect(defaultSettingsSection(admin)).toBe("general")
    expect(settingsSectionsFor(admin)).toEqual(Object.keys(SETTINGS_SECTION_RULES))
  })
  it("a manager without admin never lands on General (its profile read is ADMIN-only)", () => {
    expect(settingsSectionsFor(manager)).toEqual(["profile", "security", "my-emails", "clock-in"])
    expect(defaultSettingsSection(manager)).toBe("profile")
  })
  it("a member manager (canManageUsers) gets Members, not General", () => {
    const people = ctx({ canManageUsers: true })
    expect(settingsSectionsFor(people)).toEqual(["members", "profile", "security", "my-emails", "clock-in"])
    expect(defaultSettingsSection(people)).toBe("members")
  })
  it("a workspace administrator gets Holidays", () => {
    const ws = ctx({ canManageWorkspaces: true })
    expect(settingsSectionsFor(ws)).toContain("holidays")
  })
  it("a ?section they may not open falls back to the default", () => {
    expect(resolveSettingsSection("general", technician)).toBe("profile")
    expect(resolveSettingsSection("security", technician)).toBe("security")
    expect(resolveSettingsSection("bogus", admin)).toBe("general")
  })
  it("the audit log goes with its Option", () => {
    const noAudit = ctx({ role: "ADMIN" }, new Set([...ALL_OPTIONS].filter((o) => o !== "audit_log")))
    expect(settingsSectionsFor(noAudit)).not.toContain("audit-log")
  })
  it("dispatcher, observer and technician see only their own sections", () => {
    for (const c of [dispatcher, technician]) {
      expect(settingsSectionsFor(c)).toEqual(["profile", "security", "my-emails", "clock-in"])
    }
    // An external member holds no clock, so there is nothing to choose.
    expect(settingsSectionsFor(observer)).toEqual(["profile", "security", "my-emails"])
  })
})

// ─── The navigation ─────────────────────────────────────────────────────────

describe("the top bar", () => {
  it("an admin gets every menu", () => {
    const nav = navModelFor(admin)
    expect(nav.team).toEqual(["/members", "/invitations", "/join-requests", "/team"])
    expect(nav.documents).toEqual(["/documents", "/documents/all", "/documents/review", "/documents/types", "/documents/templates", "/documents/compliance"])
    expect(nav).toMatchObject({ calendar: true, clients: true, assets: true, portals: true, spaces: true, reports: true, invoices: true, manage: false })
    expect(nav.time).toEqual(["/attendance", "/issues", "/schedule", "/overtime"])
  })

  it("a manager's Team menu offers only what they can use — the colleague list", () => {
    const nav = navModelFor(manager)
    expect(nav.team).toEqual(["/team"])
    expect(nav.documents).toEqual([])
    expect(nav.time).toEqual(["/issues", "/schedule"])
    expect(nav).toMatchObject({ spaces: true, assets: true, reports: true, invoices: false })
  })

  it("a dispatcher keeps the colleague list and the credential board", () => {
    const nav = navModelFor(dispatcher)
    expect(nav.team).toEqual(["/team"])
    expect(nav.documents).toEqual(["/documents/compliance"])
    expect(nav).toMatchObject({ spaces: false, assets: false, reports: false })
  })

  it("an external observer is offered no organization property and no Team menu", () => {
    const nav = navModelFor(observer)
    expect(nav).toMatchObject({ calendar: false, clients: false, assets: false, portals: false, reports: false })
    expect(nav.team).toEqual([])
    expect(nav.spaces).toBe(true)
  })

  it("a technician gets no management menus", () => {
    const nav = navModelFor(technician)
    expect(nav.team).toEqual([])
    expect(nav.time).toEqual([])
    expect(nav.documents).toEqual([])
    expect(nav).toMatchObject({ spaces: false, reports: false, invoices: false, calendar: true })
  })

  it("Manage shows only for a member with the screen and no Team menu", () => {
    // The `manage` screen derives from canManageUsers, org-wide or in a workspace.
    const orgWide = ctx({ canManageUsers: true })
    expect(navModelFor(orgWide).manage).toBe(false) // they have the Team menu
    const inOneSpace = ctx({ access: { org: {}, perSpace: { s1: { canManageUsers: true } } } })
    expect(navModelFor(inOneSpace).team).toEqual([])
    expect(navModelFor(inOneSpace).manage).toBe(true)
    expect(navModelFor(technician).manage).toBe(false)
  })
})
