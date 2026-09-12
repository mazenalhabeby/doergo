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

describe("only a workspace that is a customer can be billed", () => {
  /*
    ⚠️ A workspace is one of three things — a project, your own company, or a
    customer you do work for — and only the last can be sent a bill. The picker
    listed all of them, which invited somebody to invoice their own depot.

    The schema already said so: `contactName`, `contactEmail` and the per-space
    billable rate exist on the CUSTOMER kind alone, and the Invoices tab on a
    workspace only appears for it. This picker was the one place that did not
    agree.
  */
  it("filters the picker to customer workspaces", () => {
    const src = code(PAGE)
    expect(src).toMatch(/billableSpaces[\s\S]{0,200}kind === "CUSTOMER"/)
    // Archived is finished; Remote is not a place.
    expect(src).toMatch(/isActive !== false/)
    expect(src).toMatch(/!sp\.isRemote/)
  })

  it("renders the filtered list, not the raw one", () => {
    const src = code(PAGE)
    expect(src).toContain("{billableSpaces.map(")
    expect(src).not.toMatch(/\{\(spacePage\?\.data \?\? \[\]\)\.map/)
  })

  it("says why the list is empty instead of showing an empty dropdown", () => {
    expect(code(PAGE)).toContain("invoices.create.noCustomerSpaces")
  })

  it("the SERVER refuses one too — the list is not the rule", () => {
    /*
      A list must not be stricter OR looser than the check behind it. The picker
      hiding them is what makes it convenient; this is what makes it a rule.
    */
    const svc = fs.readFileSync(
      path.join(ROOT, "../../../../../api/auth-service/src/modules/invoices/invoice.service.ts"),
      "utf8",
    ).replace(/(^|\s)\/\*[\s\S]*?\*\//g, "$1")
    expect(svc).toMatch(/space\.kind !== 'CUSTOMER'/)
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

  it("shows the save-to-CRM option BEFORE it is usable", () => {
    /*
      ⚠️ Reported: "when I choose nothing and enter the lines, how do I save
      this as a client?" — the option existed, and could not be found. It
      appeared only after two characters had been typed, as muted text the size
      of a footnote, and did nothing until Save.

      It is rendered as soon as it APPLIES, disabled with its reason until there
      is a name, and it says WHEN it will happen. Gating it on the name meant
      the answer to "can I do this at all" was "type something and find out".
    */
    const src = code(PAGE)
    // The option's visibility must NOT depend on what has been typed…
    expect(src).toMatch(/hasCrm && mayAddClient && source === "none" && \(/)
    // …only whether it can be acted on.
    expect(src).toMatch(/disabled=\{clientName\.trim\(\)\.length <= 1\}/)
    expect(src).toContain("invoices.create.alsoAddClientNeedsName")
    // And it says when the client will actually be created.
    expect(src).toContain("invoices.create.alsoAddClientWhen")
  })

  it("is reachable from the 'nothing' source, which is where it was asked for", () => {
    /*
      Entering the lines by hand is precisely when there is no CRM record yet,
      so excluding that source would remove the option from the only case that
      needs it.

      Asserted on the CONDITION, not on the distance to the label below it — a
      proximity match broke the moment the block between them grew, which is a
      test failing on layout rather than on behaviour.
    */
    const gate = code(PAGE).match(/hasCrm && mayAddClient && source [!=]== "\w+"/)?.[0]
    expect(gate).toBe('hasCrm && mayAddClient && source === "none"')
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

  it("offers to save the client ONLY when the lines are typed by hand", () => {
    /*
      ⚠️ That is the only case where the client is genuinely new to us.

      Picked FROM the CRM: already there, and adding it would duplicate the
      record it was read from. Gathered from a WORKSPACE: that customer already
      exists as a customer workspace, and adding it again makes a second version
      of one relationship for somebody to keep in step.
    */
    const gate = code(PAGE).match(/hasCrm && mayAddClient && source [!=]== "\w+"/)?.[0]
    expect(gate).toBe('hasCrm && mayAddClient && source === "none"')
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
      "noCustomerSpaces", "alsoAddClientWhen", "alsoAddClientNeedsName",
    ].filter((k) => typeof c[k] !== "string")
    expect({ lang, missing }).toEqual({ lang, missing: [] })
  })
})

describe("how the labour is written up", () => {
  /*
    Asked for: bill by tasks, by total time per member, or both.

    A managing agent wants the jobs; a staffing client wants the hours; somebody
    presenting to a board wants a figure with the detail underneath. All three
    describe the same work for the same money — a choice about the DOCUMENT, not
    about the price.
  */
  it("offers all three", () => {
    const src = code(PAGE)
    for (const k of ["groupByTask", "groupByMember", "groupByBoth"]) {
      expect(src).toContain(`invoices.create.${k}`)
    }
  })

  it("PREVIEWS the lines, so the choice visibly does something", () => {
    /*
      ⚠️ Reported: "I don't see the change when I choose between the three."
      The grouping altered only what was SENT, so picking a different one moved
      nothing on screen and read as a dead control.

      The preview renders the very array the mutation sends — not a rendering of
      the invoice, the invoice.
    */
    const src = code(PAGE)
    expect(src).toContain("invoices.create.preview")
    expect(src).toMatch(/labourLines\.map\(/)
  })

  it("shows and sends ONE calculation", () => {
    /*
      The screen used to total the work with its own loop while the mutation
      built the lines with another. Two arithmetics over one invoice is how a
      displayed total quietly stops matching the document it produced.
    */
    const src = code(PAGE)
    expect(src).toMatch(/labourSubtotal[\s\S]{0,80}labourTotalCents\(labourLines\)/)
    expect(src).toMatch(/for \(const line of labourLines\)/)
    // The old independent sum must be gone, not merely unused.
    expect(src).not.toMatch(/entries\.reduce\(\(s, e\) => s \+ entryLabor\(e\)/)
  })

  it("marks a descriptive line as included rather than unpriced", () => {
    // A zero in the amount column reads as a line somebody forgot to price.
    expect(code(PAGE)).toContain("invoices.create.included")
  })

  it("builds the lines with the SHARED rule, not a loop of its own", () => {
    /*
      ⚠️ The three groupings share one arithmetic, and the property that every
      line multiplies out is exactly the sort that dies quietly when a screen
      keeps its own copy of the rules.
    */
    const src = code(PAGE)
    expect(src).toContain("buildLabourLines(")
    // The old per-entry line construction must be gone, not merely bypassed.
    expect(src).not.toMatch(/description: `\$\{e\.taskTitle\}[\s\S]{0,80}quantity: e\.hours/)
  })

  it("only offers it once there is labour to group", () => {
    // A control with nothing to act on is a control somebody reads as broken.
    expect(code(PAGE)).toMatch(/entries\.some\(\(e\) => e\.include && e\.hours > 0\)/)
  })

  it("is translated in all five languages", () => {
    const LOCALES = path.join(ROOT, "../../../i18n/locales")
    for (const lang of ["en", "de", "es", "fr", "it"]) {
      const d = JSON.parse(fs.readFileSync(path.join(LOCALES, `${lang}.json`), "utf8"))
      const missing = [
        "groupBy", "groupByTask", "groupByMember", "groupByBoth",
        "groupByTaskHint", "groupByMemberHint", "groupByBothHint",
        "preview", "descriptionCol", "amount", "included", "labourTotal",
      ].filter((k) => typeof d.invoices?.create?.[k] !== "string")
      expect({ lang, missing }).toEqual({ lang, missing: [] })
    }
  })
})
