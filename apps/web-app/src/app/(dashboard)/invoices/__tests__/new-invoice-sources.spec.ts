import fs from "fs"
import path from "path"

import { code, createScreen } from "./_screen"

/** Where the locale files live, for the two assertions that read them. */
const ROOT = path.join(__dirname, "..")

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


const PAGE = "new/page.tsx"

/*
  ⚠️ `screen()`, not `code(PAGE)`, wherever the property is about what a person
  SEES. The shell, the fields and the document live in `_components/` now so
  that creating an invoice and correcting one are the same screen; a guard
  reading only the page file would have gone quietly green on markup it can no
  longer see. `code(PAGE)` stays for the things that genuinely belong to THIS
  page — its sources, its gather, its grouping.
*/
const screen = createScreen

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
    /*
      ⚠️ Asserted by STRUCTURE, not by the exact text of the object. This pinned
      a literal `{ spaceId }` and broke the day the service period was added —
      the property it protects was untouched, only the object grew a spread.
      A guard that fails on unrelated growth gets loosened in a hurry by
      somebody who is not thinking about what it was for.

      What matters is the ternary: one branch each, never both.
    */
    const src = code(PAGE)
    const chain = src.match(/gatherSource\s*=[\s\S]{0,500}?:\s*null/)?.[0] ?? ""
    expect(chain).toMatch(/source === "space" && spaceId/)
    expect(chain).toMatch(/source === "client" && customerId/)
    // Each branch names its own end and only its own end.
    const [spaceBranch, clientBranch] = chain.split(/source === "client" && customerId/)
    expect(spaceBranch).not.toContain("customerId:")
    expect(clientBranch).not.toContain("spaceId:")
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
    ).replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, "$1")
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
    /*
      The option's visibility must NOT depend on what has been typed.

      ⚠️ Asserted on the CONDITION alone, not on the JSX operator that follows
      it. Pinning `&& (` broke when the block became a ternary passed as a prop
      — a change that moved no logic at all, which is a guard failing on syntax
      rather than on behaviour.
    */
    expect(src).toMatch(/hasCrm && mayAddClient && source === "none"/)
    expect(src).not.toMatch(/clientName\.trim\(\)\.length > 1 &&[\s\S]{0,40}<label/)
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
    // The document is handed `documentItems`, which is built FROM labourLines —
    // so changing the grouping changes the rows on the page.
    expect(src).toMatch(/items=\{documentItems\}/)
    expect(src).toMatch(/for \(const line of labourLines\)[\s\S]{0,400}rows\.push/)
  })

  it("shows and sends ONE calculation", () => {
    /*
      The screen used to total the work with its own loop while the mutation
      built the lines with another. Two arithmetics over one invoice is how a
      displayed total quietly stops matching the document it produced.
    */
    const src = code(PAGE)
    expect(src).toMatch(/labourSubtotal[\s\S]{0,80}labourTotalCents\(labourLines\)/)
    // The payload maps off the very list the sheet rendered.
    expect(src).toMatch(/for \(const row of documentItems\)/)
    // The old independent sum must be gone, not merely unused.
    expect(src).not.toMatch(/entries\.reduce\(\(s, e\) => s \+ entryLabor\(e\)/)
  })

  it("marks a descriptive line as included rather than unpriced", () => {
    // A zero in the amount column reads as a line somebody forgot to price.
    expect(screen()).toContain("invoices.create.included")
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

describe("the page has a shape", () => {
  /*
    ⚠️ It was nine identically-weighted cards in one column, max-w-4xl, with the
    totals at the bottom of the scroll and the save button duplicated top and
    bottom. Everything shouting equally is the whole of why it read as old: with
    no hierarchy a person has to read each block to find out what it is, and the
    figure they are deciding about is the one thing they cannot see while
    deciding.
  */
  const src = () => screen()

  it("keeps the total and the action in reach while the page scrolls", () => {
    /*
      ⚠️ Asserted INSIDE the bar component, not by order across the assembled
      screen. Order was the right call while this was one file; once the shell
      moved out, "the title comes after the sticky class" started depending on
      which file the concatenation put first — a guard answering a question
      about the test helper rather than about the page.

      Within the bar, the property still holds: it is sticky, it carries the
      title, and the actions are last.
    */
    /*
      Sliced to the bar itself: `SectionHead` in the same file also renders a
      `{title}`, and an indexOf over the whole file finds that one first.
    */
    const shell = code("_components/invoice-shell.tsx")
    const bar = shell.slice(shell.indexOf("export function InvoiceTopBar"))
    const sticky = bar.indexOf("sticky top-0")
    expect(sticky).toBeGreaterThan(-1)
    expect(bar.indexOf("{title}")).toBeGreaterThan(sticky)
    expect(bar.indexOf("{children}")).toBeGreaterThan(bar.indexOf("{title}"))
    // And the page is the thing that names it.
    expect(code(PAGE)).toMatch(/title=\{t\("invoices\.create\.title"\)\}/)
    expect(src()).toMatch(/lg:sticky/)
  })

  it("splits the tool from the artefact", () => {
    /*
      ⚠️ The chrome recedes and the document floats on it. What was wrong before
      was that controls and invoice sat in identical slabs, so nothing was more
      important than anything else — and the settings sat ABOVE the thing they
      change, so you scrolled away from it to alter it.
    */
    const s = src()
    expect(s).toMatch(/lg:grid-cols-\[320px_minmax\(0,1fr\)\]/)
    // The rail stays put while the document does not move.
    expect(s).toMatch(/lg:sticky lg:top-\[53px\]/)
  })

  it("offers the client's copy as well as the working view", () => {
    const s = src()
    expect(s).toContain("invoices.create.viewWorking")
    expect(s).toContain("invoices.create.viewClient")
    // ⚠️ Both faces render the SAME rows. A second rendering with its own
    // arithmetic is how a preview starts telling somebody something the
    // document does not say.
    // Both frames iterate the one `items` prop the page hands them.
    expect(code("_components/invoice-document.tsx").match(/items\.map\(/g) ?? []).toHaveLength(2)
  })

  it("dresses the client's copy as a document, not as the app", () => {
    // The only surface a customer ever sees. Anything that reads as software
    // tells them they are looking at somebody's dashboard rather than a bill.
    const s = src()
    for (const k of ["documentWord", "billedTo", "amountDue", "payment"]) {
      expect(s).toContain(`invoices.create.${k}`)
    }
  })

  it("says what is missing instead of only disabling Save", () => {
    // A greyed-out action with no reason beside it is the commonest way a form
    // wastes somebody's afternoon.
    const s = src()
    expect(s).toContain("invoices.create.needsClient")
    expect(s).toContain("invoices.create.needsLines")
  })

  it("numbers the sections so the eye has somewhere to land", () => {
    /*
      ⚠️ On the rail SECTION, not on the heading component. The number used to
      go straight to `SectionHead`; sections are wrapped now, and a guard pinned
      to the inner component would have gone green while a page numbered nothing.
    */
    expect(src()).toMatch(/<RailSection step=\{1\}/)
    expect(src()).toMatch(/<RailSection step=\{2\}/)
  })

  it("has exactly one save action", () => {
    // It lives in the sticky bar, so a second copy at the foot — which only
    // existed because the first scrolled away — is no longer needed.
    const s = src()
    expect(s.match(/invoices\.create\.saveDraft/g) ?? []).toHaveLength(1)
  })
})

describe("the document is the document", () => {
  /*
    ⚠️ The research every invoicing tool converges on: somebody building a bill
    is trying to answer "what will the client receive", and a stack of form
    panels never answers it. So the screen renders the invoice — head band with
    the client and the hero total, a real line table, the reckoning
    right-aligned under the amounts column.
  */
  const src = () => screen()

  it("renders one list that is also what gets sent", () => {
    // A preview built separately from the payload is a preview that eventually
    // lies, and the lie is found by a customer holding both.
    const s = src()
    expect(s).toMatch(/const documentItems = useMemo/)
    /*
      ⚠️ The SAME list is handed to the document and to the payload. The rows
      are built once on the page, passed to the shared document as `items`, and
      iterated again by the mutation — so "what is shown" and "what is sent"
      cannot be two different computations.
    */
    expect(code(PAGE)).toMatch(/items=\{documentItems\}/)
    expect(code("_components/invoice-document.tsx")).toMatch(/items\.map\(/)
    expect(s).toMatch(/for \(const row of documentItems\)/)
  })

  it("makes the total the hero", () => {
    // What the reader looks for first on the finished document, and what the
    // author is deciding about while building it.
    expect(src()).toMatch(/text-3xl font-semibold tabular-nums/)
  })

  it("says what to do when the document is empty", () => {
    // A blank table with headings and no rows reads as broken rather than as
    // not started.
    const s = src()
    expect(s).toContain("invoices.create.emptyDocument")
    expect(s).toContain("invoices.create.emptyDocumentHint")
  })

  it("aligns every number for comparison", () => {
    // Money in a column that does not line up is money nobody checks.
    const doc = code("_components/invoice-document.tsx")
    const from = doc.indexOf("items.map(")
    const table = doc.slice(from, doc.indexOf("</table>", from))
    expect(table.match(/tabular-nums/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
    expect(table).toMatch(/text-right/)
  })
})

describe("the pickers", () => {
  /*
    ⚠️ Both were native selects — a scroll with no search. Fine for three
    workspaces, useless at thirty, and there is no moment where anybody notices
    it became useless: it simply gets slower every time a customer is added.

    The client list is the one that bites. A real book runs to hundreds and the
    query caps at 200, so the two hundredth client was unreachable by anything
    except scrolling.
  */
  const src = () => screen()

  it("are searchable, not native selects", () => {
    const s = src()
    expect(s.match(/<Combobox/g) ?? []).toHaveLength(2)
    expect(s).not.toMatch(/<select\b/)
  })

  it("match on more than the name", () => {
    // Somebody looking for a client they invoiced last year remembers the town
    // far more often than the exact registered name.
    const s = src()
    expect(s).toMatch(/keywords: \[c\.email, c\.address/)
    expect(s).toMatch(/keywords: \[sp\.address, sp\.contactName/)
  })

  it("reuses the app's own component rather than a second one", () => {
    // A second picker here is a second set of keyboard behaviour to get right
    // and keep right.
    expect(src()).toContain('from "@/components/ui/combobox"')
  })

  it("labels the search box in all five languages", () => {
    const LOCALES = path.join(ROOT, "../../../i18n/locales")
    for (const lang of ["en", "de", "es", "fr", "it"]) {
      const d = JSON.parse(fs.readFileSync(path.join(LOCALES, `${lang}.json`), "utf8"))
      const missing = ["searchWorkspace", "searchClient"]
        .filter((k) => typeof d.invoices?.create?.[k] !== "string")
      expect({ lang, missing }).toEqual({ lang, missing: [] })
    }
  })
})

describe("the rail survives being narrow", () => {
  /*
    ⚠️ Reported with a screenshot, and the port's own fault: the "who it is for"
    block kept the two-column grid it had when the page was full width, and was
    dropped into a 320px rail. "Issue date" wrapped onto two lines, "Rate (per
    hour)" onto three, and the currency box showed "EUF".

    A layout is not portable just because it is responsive — `sm:grid-cols-2`
    asks about the VIEWPORT, and what got narrow here was the container.
  */
  const src = () => screen()

  it("does not ask the viewport about a 320px column", () => {
    const s = src()
    const rail = s.slice(s.indexOf("<aside"), s.indexOf("</aside>"))
    expect(rail).not.toMatch(/sm:grid-cols-2/)
  })

  it("separates the terms from the client", () => {
    // A section called "who it is for" that also sets the hourly rate is a
    // section somebody reads twice to use once.
    const s = src()
    expect(s).toContain("invoices.create.termsSection")
    const who = s.indexOf("invoices.create.clientSection")
    const terms = s.indexOf("invoices.create.termsSection")
    expect(terms).toBeGreaterThan(who)
    // The rate moved with them.
    expect(s.indexOf("invoices.create.rateHint")).toBeGreaterThan(who)
  })

  it("gives an address room to be an address", () => {
    // It went to the client's copy as a single squeezed input, so a real one
    // was truncated in a 60px box.
    const s = src()
    expect(s).toMatch(/Textarea[\s\S]{0,200}setClientAddress/)
  })

  it("stacks the three-way choices instead of wrapping them", () => {
    /*
      Three options of very different lengths in a flex-wrap put two on one row
      and the third alone underneath — which reads as two choices and an
      afterthought rather than as one choice of three.
    */
    const s = src()
    expect(s).not.toMatch(/flex flex-wrap gap-2/)
    expect(s.match(/grid gap-1 rounded-xl border border-border bg-muted\/50 p-1/g) ?? []).toHaveLength(2)
  })
})
