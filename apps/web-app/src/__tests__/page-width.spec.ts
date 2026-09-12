import fs from "fs"
import path from "path"

/*
  EVERY PAGE SITS IN THE SAME COLUMN.

  ⚠️ The width was a magic number typed into EIGHTEEN places. The navbar centres
  itself in 1440px with a 24px gutter, and each page said the same thing again
  in its own words — so a page that forgot simply ran to the edge of the
  monitor while the navigation above stopped two hundred pixels short. The New
  Invoice screen did exactly that: its bar put the back arrow in one far corner
  and Save draft in the other, and its rail sat on the bezel.

  ⚠️ And it is invisible where the work happens. At 1440px the container and the
  viewport are the same thing, so the page looks right on the machine it was
  built on and wrong on the machine it was bought for.

  One constant now. This fails if a nineteenth copy appears.
*/

const SRC = path.join(__dirname, "..")
const SOURCE = path.join(SRC, "components/ui/page-width.ts")

/*
  Code only — the opener must follow whitespace OR a brace. A string holding a
  slash-star (a media type) opens a comment as far as a regex is concerned, and
  requiring whitespace alone stops JSX comments being stripped, since those
  open as brace-slash-star. Both traps have been fallen into in this repo.
*/
const strip = (src: string) =>
  src.replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, "$1").replace(/(^|[^:/])\/\/[^\n]*/g, "$1")

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue
      walk(full, out)
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

describe("the page column", () => {
  it("is stated in exactly one file", () => {
    const offenders = walk(SRC)
      .filter((f) => f !== SOURCE)
      .filter((f) => strip(fs.readFileSync(f, "utf8")).includes("max-w-[1440px]"))
      .map((f) => path.relative(SRC, f))

    expect(offenders).toEqual([])
  })

  it("carries the width and the gutter, and nothing else", () => {
    /*
      Vertical padding, flex and grid stay the caller's business — a constant
      that also decided those would be reached for, found unsuitable, and
      copied around again, which is how the eighteen happened.
    */
    const { PAGE_WIDTH } = require("../components/ui/page-width")
    expect(PAGE_WIDTH).toContain("max-w-[1440px]")
    expect(PAGE_WIDTH).toContain("mx-auto")
    expect(PAGE_WIDTH).toContain("px-6")
    expect(PAGE_WIDTH).not.toMatch(/\bpy-|\bflex\b|\bgrid\b/)
  })

  it("is what the navbar itself uses", () => {
    /*
      The navbar IS the reference line — it is what a person compares a page
      against. If it ever stopped reading the constant, every page would keep
      lining up with a column the navigation had left.
    */
    const nav = strip(fs.readFileSync(path.join(SRC, "components/top-navbar.tsx"), "utf8"))
    expect(nav).toContain("PAGE_WIDTH")
  })
})

describe("a full-bleed band holds a contained column", () => {
  /*
    A sticky bar has to do two things at once: its border, ground and blur reach
    both edges of the window, because a divider stopping in mid-air looks
    broken — and its CONTENTS line up with the navigation. That is two
    elements, and collapsing them into one is the bug this whole spec is about.

    ⚠️ Read from the SHELL, not from a page. The bar, the notice and the
    workbench moved into `invoices/_components/invoice-shell.tsx` so that
    creating an invoice and correcting one are one screen — which also means
    getting this right once fixes both, and getting it wrong once breaks both.
  */
  const shell = strip(
    fs.readFileSync(
      path.join(SRC, "app/(dashboard)/invoices/_components/invoice-shell.tsx"),
      "utf8",
    ),
  )

  it("does not put the sticky bar's border on the contained element", () => {
    const bar = shell.match(/className="sticky top-0 z-30[^"]*"/)?.[0] ?? ""
    expect(bar).toContain("border-b")
    // The band spans the window, so it must NOT be the thing that is centred.
    expect(bar).not.toContain("max-w")
    expect(bar).not.toContain("mx-auto")
  })

  it("centres the bar's contents in the page column", () => {
    expect(shell).toMatch(/cn\(PAGE_WIDTH, "flex items-center/)
  })

  it("puts the rail and the canvas in that column too", () => {
    // Otherwise the bar lines up and the panel under it still sits on the bezel.
    expect(shell).toMatch(/cn\(PAGE_WIDTH, "grid items-start/)
  })

  it("is what BOTH invoice screens are built from", () => {
    /*
      The whole point: the edit screen was a stack of cards with native date
      inputs and no sight of the document. It is the same shell now, so a
      single fix reaches both — and neither can drift away on its own.
    */
    for (const page of ["app/(dashboard)/invoices/new/page.tsx", "app/(dashboard)/invoices/[id]/edit/page.tsx"]) {
      const src = strip(fs.readFileSync(path.join(SRC, page), "utf8"))
      expect(src).toContain("InvoiceTopBar")
      expect(src).toContain("InvoiceWorkbench")
      expect(src).toContain("InvoiceDocument")
    }
  })
})

describe("money reads the same everywhere", () => {
  /*
    ⚠️ SIX COPIES of the same formatter, all passing `en-IE` — and an Irish
    locale disambiguates the dollar, so a USD invoice read "US$1,234.50" where
    the person raising it expected "$1,234.50". Reported from the screen; it was
    true on the list, the detail page, the document and the PDF as well, because
    each had its own copy of the same four lines.
  */
  const files = walk(SRC).filter((f) => f !== path.join(SRC, "lib/money.ts"))

  it("is formatted in exactly one place", () => {
    const offenders = files
      .filter((f) => /style:\s*["']currency["']/.test(strip(fs.readFileSync(f, "utf8"))))
      .map((f) => path.relative(SRC, f))
    expect(offenders).toEqual([])
  })

  it("asks for the symbol a reader of that currency would use", () => {
    const src = fs.readFileSync(path.join(SRC, "lib/money.ts"), "utf8")
    expect(src).toContain("narrowSymbol")
  })

  it("never throws on a currency code that came from real data", () => {
    // Intl raises a RangeError on an unknown code, and a screen about money is
    // the worst place to trade a wrong symbol for a blank page.
    const { formatMoney } = require("../lib/money")
    expect(formatMoney(1234.5, "USD")).toBe("$1,234.50")
    expect(formatMoney(1234.5, "EUR")).toBe("€1,234.50")
    expect(() => formatMoney(1, "NOT-A-CODE")).not.toThrow()
    expect(() => formatMoney(1, "")).not.toThrow()
    expect(formatMoney(NaN, "EUR")).toBe("€0.00")
  })
})
