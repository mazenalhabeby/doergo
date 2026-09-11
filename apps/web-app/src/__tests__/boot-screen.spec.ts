import { readFileSync } from "fs"
import { join } from "path"

/*
  The screen shown before the app knows who you are.

  It used to be the DASHBOARD SKELETON — a navbar, a sidebar and a grid of
  content cards — drawn while the auth check ran. For somebody signed in that is
  a fair guess at what comes next. For somebody who is not, it is a picture of an
  application they cannot enter, shown for a moment and then replaced by the
  login page; signing out gave the same flash in reverse.

  While the answer is unknown the honest screen belongs to neither side.
*/
const SRC = join(__dirname, "..")
const read = (p: string) => readFileSync(join(SRC, p), "utf8")

/*
  ⚠️ Code only, for the rules stated as "must NOT contain".

  The file these police explains WHY `force-light` and a `hasTokens()` lookup
  are wrong — by naming them. A scanner that reads comments reports the
  documentation as the violation, so the guard fails on a file that is correct
  and everybody learns to ignore it. This codebase has made that mistake in four
  separate guards.
*/
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")

describe("the boot screen", () => {
  it("is what both auth gates draw while the answer is unknown", () => {
    for (const f of ["app/(dashboard)/layout.tsx", "contexts/auth-context.tsx"]) {
      const src = read(f)
      expect(src).toContain("<BootScreen />")
      // The signed-in application must not be drawn before we know.
      expect(src).not.toContain("<DashboardSkeleton />")
    }
  })

  it("holds the screen after the answer is no, instead of going blank", () => {
    /*
      `return null` left a blank white page between the loading state and the
      login page, so the sequence was skeleton, then nothing, then login. Three
      screens for one navigation.
    */
    for (const f of ["app/(dashboard)/layout.tsx", "contexts/auth-context.tsx"]) {
      const src = read(f)
      /*
        The LAST one — the render guard. The first `if (!isAuthenticated)` in the
        layout is inside the effect that fires the redirect, and matching it
        would test the wrong statement and pass for the wrong reason.
      */
      const at = src.lastIndexOf("if (!isAuthenticated)")
      expect(at).toBeGreaterThan(-1)
      /*
        Only as far as the closing brace of THAT guard.

        A fixed window ran past it into the next one — a different check, with a
        legitimate `return null` of its own — so the test failed on a statement
        it was never about.
      */
      const guard = src.slice(at, src.indexOf("}", src.indexOf("{", at)) + 1)
      expect(guard).toContain("BootScreen")
      expect(guard).not.toContain("return null")
    }
  })

  it("follows the theme, because most of the time it is on its way to the app", () => {
    /*
      ⚠️ IT WAS `force-light`, wearing the auth pages' gradient on the reasoning
      that "this is what login is about to look like". True only for somebody
      signed OUT — and they are the rarer case. A signed-in person hits this
      screen on EVERY app open while the auth check runs, so anyone working in
      dark mode got a white flash before a dark dashboard, every single time.
      Reported from real use.
    */
    const src = code("components/skeletons/boot-screen.tsx")
    expect(src).not.toContain("force-light")
    // Light ground kept, dark ground added — it is the same screen, themed.
    for (const token of ["from-slate-100", "via-slate-50", "to-slate-100"]) {
      expect(src).toContain(token)
    }
    expect(src).toMatch(/dark:from-slate-9\d0/)
    expect(src).toMatch(/dark:to-slate-9\d0/)
  })

  it("the mark stays visible on the dark ground", () => {
    // The logo defaults to dark text. On the dark background that is a loading
    // screen with nothing on it — worse than the flash it replaced.
    const src = read("components/skeletons/boot-screen.tsx")
    expect(src).toContain('variant="light"')
    expect(src).toContain("dark:hidden")
    expect(src).toMatch(/hidden dark:(inline-block|block)/)
  })

  it("decides in CSS, never from storage", () => {
    /*
      The obvious version asks `hasTokens()` which way this is going. That reads
      localStorage, which does not exist during the server render — so the
      server emits one palette and the client another, a hydration mismatch on
      the very first thing painted.
    */
    const src = code("components/skeletons/boot-screen.tsx")
    expect(src).not.toMatch(/hasTokens|localStorage|useState|useEffect/)
  })

  it("announces itself as loading rather than as a logo", () => {
    const src = read("components/skeletons/boot-screen.tsx")
    expect(src).toContain('role="status"')
    expect(src).toContain('aria-busy="true"')
    expect(src).toContain("sr-only")
  })
})
