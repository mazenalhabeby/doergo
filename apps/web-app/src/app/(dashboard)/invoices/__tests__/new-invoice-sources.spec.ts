import fs from "fs"
import path from "path"

/*
  AN INVOICE HAS MORE THAN ONE STARTING POINT.

  ⚠️ This screen could only ever bill a WORKSPACE, and only when something else
  had already put `?spaceId=` in the address. Opening it from the Invoices page
  gave an empty form with no way to pull any work in — and a company that bills
  a CLIENT whose jobs sit in three workspaces, or in none, simply could not
  produce that invoice here.

  Three sources now, because all three are real: a workspace, a client, or
  nothing at all (a charge that was never a task).
*/

const ROOT = path.join(__dirname, "..")
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8")
/*
  Code only. A string containing a slash-star opens a comment as far as a regex
  is concerned, so the opener must follow whitespace or a line start.
*/
const code = (p: string) =>
  read(p).replace(/(^|\s)\/\*[\s\S]*?\*\//g, "$1").replace(/(^|[^:/])\/\/[^\n]*/g, "$1")

const PAGE = "new/page.tsx"

describe("where the work comes from", () => {
  it("offers all three sources", () => {
    const src = code(PAGE)
    for (const key of ["invoices.create.fromSpace", "invoices.create.fromClient", "invoices.create.fromNothing"]) {
      expect(src).toContain(key)
    }
  })

  it("no longer depends on a URL parameter to be usable", () => {
    // The workspace is picked IN the form; the query string only seeds it.
    const src = code(PAGE)
    expect(src).toContain("setPickedSpaceId")
    expect(src).toMatch(/spaceIdFromUrl/)
  })

  it("gathers from exactly one end", () => {
    /*
      A workspace and a client together would silently INTERSECT, and an empty
      result then reads as "nothing to bill" when it means "these two do not
      overlap". The shape makes both-at-once unrepresentable.
    */
    const src = code(PAGE)
    expect(src).toMatch(/gatherSource\s*=[\s\S]{0,260}\{ spaceId \}[\s\S]{0,160}\{ customerId \}/)
  })

  it("re-seeds when the source changes", () => {
    // `seeded` stops the form overwriting what somebody typed — and also meant
    // picking a SECOND workspace filled in nothing and looked broken.
    const src = code(PAGE)
    expect(src).toMatch(/lastSeedKey[\s\S]{0,200}setSeeded\(false\)/)
  })
})

describe("the CRM, when there is one", () => {
  it("is detected from the session, not from a request", () => {
    // It arrives with the user, so it costs nothing, cannot disagree with the
    // navigation, and needs no reload.
    const src = code(PAGE)
    expect(src).toMatch(/spaceModules === undefined/)
    expect(src).toContain('.includes("crm")')
  })

  it("hides the client source entirely when there is no CRM", () => {
    const src = code(PAGE)
    expect(src).toMatch(/hasCrm \?[\s\S]{0,120}fromClient/)
  })

  it("offers to keep a hand-typed client — but only where one may be created", () => {
    /*
      `crmCaps` is the SERVER's own answer about who may create a client, so the
      offer cannot appear for somebody the server would then refuse.
    */
    const src = code(PAGE)
    expect(src).toMatch(/crmCaps\?\.manage|crmCaps\?\.editInfo/)
    expect(src).toMatch(/hasCrm && mayAddClient/)
  })

  it("never offers to re-add a client that CAME from the CRM", () => {
    // That would quietly duplicate the record it was read from.
    expect(code(PAGE)).toMatch(/mayAddClient && source !== "client"/)
  })

  it("saves the client after the invoice, and never instead of it", () => {
    // A duplicate-name refusal must not throw away a finished invoice.
    const src = code(PAGE)
    const invoiceDone = src.indexOf("invoices.create.created")
    const clientSave = src.indexOf("customersApi.create")
    expect(invoiceDone).toBeGreaterThan(-1)
    expect(clientSave).toBeGreaterThan(invoiceDone)
    expect(src).toMatch(/try \{[\s\S]{0,400}customersApi\.create[\s\S]{0,400}catch/)
  })
})

describe("the nav label", () => {
  const LOCALES = path.join(ROOT, "../../../i18n/locales")
  it.each(["en", "de", "es", "fr", "it"])("is one word in %s", (lang) => {
    const d = JSON.parse(fs.readFileSync(path.join(LOCALES, `${lang}.json`), "utf8"))
    const label = d.nav?.sidebar?.invoices
    expect(typeof label).toBe("string")
    // "Customer Invoices" / "Facturas de clientes" — the qualifier is noise in a
    // navigation bar where everything already belongs to this organization.
    expect(label.trim().split(/\s+/)).toHaveLength(1)
  })

  it.each(["en", "de", "es", "fr", "it"])("translates every new source string in %s", (lang) => {
    const d = JSON.parse(fs.readFileSync(path.join(LOCALES, `${lang}.json`), "utf8"))
    const c = d.invoices?.create ?? {}
    const missing = [
      "billFrom", "fromSpace", "fromClient", "fromNothing", "workspace", "client",
      "choose", "clientFillsHeader", "nothingHint", "alsoAddClient", "clientAdded", "clientAddFailed",
    ].filter((k) => typeof c[k] !== "string")
    expect({ lang, missing }).toEqual({ lang, missing: [] })
  })
})
