import fs from "fs"
import path from "path"
import { isReportLabelKey, localizeReportColumns, reportLabel } from "@hbcfield/shared/client"

/*
  The reports screen names datasets and columns in the VIEWER's language.

  The words come from REPORT_LABELS — the catalogue task-service reads for the
  scheduled email — so a column cannot be "Stunden" on screen and "Hours worked"
  in Monday's email. The CSV and PDF are made from the result the table shows,
  so localizing that result once is what names the exports too; a heading
  rendered from the raw English `label` anywhere on the screen is a column that
  did not get translated.
*/
const PAGE = path.join(__dirname, "..", "page.tsx")
const code = fs.readFileSync(PAGE, "utf8").replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, "$1").replace(/(^|[^:/])\/\/[^\n]*/g, "$1")

describe("reports — column names in the reader's language", () => {
  it("names every timesheet column chip from the catalogue", () => {
    const block = code.match(/const TIMESHEET_COLS: string\[\] = \[([\s\S]*?)\]/)
    expect(block).not.toBeNull()
    const keys = [...block![1].matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1])
    expect(keys.length).toBeGreaterThan(5)
    for (const key of keys) expect({ key, catalogued: isReportLabelKey(`col.${key}`) }).toEqual({ key, catalogued: true })
  })

  it("localizes the result in both views — the table, the CSV and the PDF all read it", () => {
    const memo = code.slice(code.indexOf("const displayResult = useMemo"), code.indexOf("const measureCols"))
    expect(memo.match(/localizeReportColumns\(/g)?.length).toBe(2)
    expect(memo).toMatch(/\[[^\]]*\blang\b[^\]]*\]\)/) // re-rendered when the language changes
  })

  it("never renders a dataset, measure or dimension by its raw English label", () => {
    expect(code).not.toMatch(/>\{(d|m|dim|dsMeta\??)\.label\}</)
    expect(code).not.toMatch(/\[dsMeta\?\.label/)
  })

  it("renders a result column in German, and leaves an organization's own column as written", () => {
    const cols = localizeReportColumns(
      [
        { key: "hours", labelKey: "col.hoursWorked", label: "Hours worked", kind: "measure" as const },
        { key: "cf", label: "Kilometerstand", kind: "dimension" as const },
      ],
      "de",
    )
    expect(cols.map((c) => c.label)).toEqual(["Gearbeitete Stunden", "Kilometerstand"])
    expect(reportLabel("it", "dataset.attendance")).toBe("Presenze / Fogli ore")
  })
})
