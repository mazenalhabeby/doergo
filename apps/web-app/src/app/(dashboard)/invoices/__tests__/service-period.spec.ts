import fs from "fs"
import path from "path"

import { createScreen, editScreen, strip } from "./_screen"

/*
  AN INVOICE FOR HOURS HAS TO SAY WHICH DAYS.

  ⚠️ The gather used to take everything outstanding, so an invoice billing a
  workspace read "37.5h — €1,500" with nothing to check it against. The client
  cannot reconcile that with their own records, and the question comes back as
  an email a week later — by which time the person who raised it is gathering a
  different fortnight and can no longer reproduce what they sent.

  Three properties are pinned here, each of which has a way of quietly going
  wrong:

    1. The filter is INCLUSIVE at both ends. A half-open range drops everything
       finished on the last day of the month, which is the most common day to
       close a job before billing it — and it drops it SILENTLY, as a slightly
       smaller invoice.

    2. A job counts on the day the WORK was done (the report's `completedAt`),
       not the day its row was last touched. Filtering on `updatedAt` alone
       moves a job into a different month because somebody fixed its title.

    3. The period the screen SHOWS is the period it SENDS and the period that
       is STORED. Recomputing it anywhere in that chain is how a document ends
       up claiming a fortnight it was not built from.
*/

const WEB = path.join(__dirname, "..")
const SERVICE = path.join(
  __dirname,
  "../../../../../../api/auth-service/src/modules/invoices/invoice.service.ts",
)

const read = (p: string) => fs.readFileSync(p, "utf8")

const service = () => strip(read(SERVICE))
/*
  ⚠️ The SCREEN, not the page file. The document moved into `_components/` so
  that creating an invoice and correcting one are the same screen — and these
  assertions are about what a client receives, which is rendered there now.
*/
const page = () => createScreen()

describe("the service period", () => {
  it("is inclusive at both ends of the day", () => {
    const src = service()
    // Start of the first day, end of the last. A `to` that stops at midnight
    // would exclude the whole of the closing day.
    expect(src).toContain("T00:00:00.000Z")
    expect(src).toContain("T23:59:59.999Z")
    expect(src).toMatch(/gte:\s*from/)
    expect(src).toMatch(/lte:\s*to/)
  })

  it("parses a day in exactly one place", () => {
    /*
      ⚠️ The gather's filter and the period written onto the invoice must come
      from the SAME parse. Two parsers here is how the days an invoice says it
      covers drift by one from the days it was built from — and nothing on any
      screen would show it.
    */
    const src = service()
    const starts = src.match(/T00:00:00\.000Z/g) ?? []
    const ends = src.match(/T23:59:59\.999Z/g) ?? []
    expect(starts).toHaveLength(1)
    expect(ends).toHaveLength(1)
    expect(src).toMatch(/function dayStart\(/)
    expect(src).toMatch(/function dayEnd\(/)
  })

  it("dates a job by when the work was done, not when the row was touched", () => {
    const src = service()
    // `updatedAt` is allowed, but only as the fallback for a task with no
    // report — which is what the `serviceReport: null` branch says.
    expect(src).toMatch(/serviceReport:\s*\{\s*completedAt:/)
    expect(src).toMatch(/serviceReport:\s*null/)
  })

  it("stores the period rather than deriving it from the lines", () => {
    /*
      A quiet fortnight gathers nothing. An invoice whose dates came from its
      own lines would then claim a different period than the one it was raised
      for — or none at all.
    */
    const src = service()
    expect(src).toContain("servicePeriodFrom")
    expect(src).toContain("servicePeriodTo")
  })

  it("sends the period the screen showed", () => {
    const src = page()
    // Both the gather and the create read the same two pieces of state.
    expect(src).toMatch(/from:\s*periodFrom\s*\|\|\s*undefined/)
    expect(src).toMatch(/servicePeriodFrom:\s*periodFrom\s*\|\|\s*undefined/)
    expect(src).toMatch(/servicePeriodTo:\s*periodTo\s*\|\|\s*undefined/)
  })

  it("builds preset dates from LOCAL parts", () => {
    /*
      ⚠️ `toISOString().slice(0,10)` converts to UTC first, so anywhere east of
      Greenwich the 1st of a month becomes the 31st of the one before — and a
      preset called "last month" would start a day early on a screen whose only
      job is to state which days are charged for.
    */
    const src = page()
    expect(src).toMatch(/function isoOf\(/)
    expect(src).not.toMatch(/toISOString\(\)\.slice\(0,\s*10\)/)
  })

  it("states the period on what the client receives", () => {
    // The working view is ours; this is the document the client is handed.
    const src = page()
    expect(src).toContain("invoices.create.servicePeriod")

    const pdf = strip(read(path.join(WEB, "../../../lib/invoice-pdf.ts")))
    expect(pdf).toContain("Service period")
    expect(pdf).toContain("servicePeriodFrom")
    // And the same statement reaches the EDIT screen, which shows the period
    // the invoice was raised for rather than inventing a new one.
    expect(editScreen()).toContain("invoices.create.servicePeriod")
  })

  it("says nothing where no period was chosen", () => {
    /*
      Blank is a real answer — "everything outstanding" is right for a one-off
      job. A row reading "Service period —" invites exactly the question the
      row exists to answer.
    */
    const pdf = strip(read(path.join(WEB, "../../../lib/invoice-pdf.ts")))
    expect(pdf).toMatch(/if \(inv\.servicePeriodFrom \|\| inv\.servicePeriodTo\)/)
    // The document renders the row only when the caller gave it a label.
    expect(page()).toMatch(/\{periodLabel && \(/)
  })
})
