import fs from "fs"
import path from "path"

/*
  The PDF engine (jsPDF + autotable) is fetched when "Download PDF" is pressed,
  never with the page. A static import anywhere in the page's own files would
  put it in the route's bundle for every reader who only wanted to look.
*/
const DIR = path.join(__dirname, "..")
const strip = (src: string) => src.replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, "$1").replace(/(^|[^:/])\/\/[^\n]*/g, "$1")

describe("the job report page", () => {
  // The page, every component it draws, and the model they read — the screen, not a hand-kept list.
  const components = fs
    .readdirSync(path.join(DIR, "_components"))
    .filter((f) => /\.tsx?$/.test(f))
    .sort()
  const files = ["page.tsx", ...components.map((f) => `_components/${f}`), "_lib/report-model.ts"]

  it.each(files)("%s does not import jsPDF or the PDF builder statically", (f) => {
    const src = strip(fs.readFileSync(path.join(DIR, f), "utf8"))
    expect(src).not.toMatch(/from\s+["']jspdf/)
    expect(src).not.toMatch(/from\s+["'][^"']*job-report-pdf["']/)
  })

  it("loads the builder with import() when Download is pressed", () => {
    expect(strip(fs.readFileSync(path.join(DIR, "page.tsx"), "utf8"))).toMatch(
      /await import\(["']\.\/_lib\/job-report-pdf["']\)/,
    )
  })

  it("never renders raw HTML", () => {
    for (const f of files) expect(fs.readFileSync(path.join(DIR, f), "utf8")).not.toContain("dangerouslySetInnerHTML")
  })
})
