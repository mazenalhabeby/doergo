import { readdirSync, statSync } from "fs"
import { join, relative, sep } from "path"
import { pageShape } from "../components/skeletons/page-shape"

/*
  Every dashboard page loads through ONE loading.tsx and ONE map (loading-skeletons board, 2026-10-26).
  This walks the real route folders, so a new page shows up here and must have the shape it should.
*/
const ROOT = join(__dirname, "..", "app", "(dashboard)")

function files(dir: string, name: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return f.startsWith("_") ? [] : files(p, name)
    return f === name ? [p] : []
  })
}
const route = (file: string) =>
  "/" +
  relative(ROOT, file)
    .split(sep)
    .slice(0, -1)
    .join("/")
    .replace(/\[([^\]]+)\]/g, "x1")

const EXPECTED: Record<string, string> = {
  "/dashboard": "dashboard",
  "/messages": "messages",
  "/calendar": "calendar",
  "/schedule": "calendar",
  "/settings": "form",
  "/settings/billing": "form",
  "/invoices/new": "form",
  "/invoices/x1/edit": "form",
  "/members/new": "form",
  "/tasks/x1": "detail",
  "/tasks/x1/report": "detail",
  "/members/x1": "detail",
  "/clients/x1": "detail",
  "/assets/x1": "detail",
  "/invoices/x1": "detail",
  "/locations/x1": "detail",
  "/locations/x1/portals/x1": "detail",
  "/shared/x1": "detail",
  "/my/documents/x1/sign": "detail",
}

describe("page loading", () => {
  const routes = files(ROOT, "page.tsx").map(route)

  it("finds the dashboard's pages", () => expect(routes.length).toBeGreaterThan(40))

  it.each(routes)("%s draws its own shape (a list unless named)", (r) => {
    expect(pageShape(r)).toBe(EXPECTED[r] ?? "list")
  })

  it("named pages beside the ids stay lists", () => {
    for (const r of ["/tasks/recurring", "/members/leave-opening", "/members/phone-sync", "/my/attendance"])
      expect(pageShape(r)).toBe("list")
    expect(pageShape("/tasks/abc/")).toBe("detail")
  })

  it("has ONE loading.tsx, at the dashboard — a second would bring back a page-specific copy", () => {
    expect(files(ROOT, "loading.tsx").map((f) => relative(ROOT, f))).toEqual(["loading.tsx"])
  })
})
