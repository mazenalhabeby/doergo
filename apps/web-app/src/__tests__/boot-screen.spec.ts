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

  it("wears the auth pages' own background, so login is a fade and not a jump", () => {
    const src = read("components/skeletons/boot-screen.tsx")
    const authLayout = read("app/(auth)/layout.tsx")
    for (const token of ["force-light", "from-slate-100", "via-slate-50", "to-slate-100"]) {
      expect(src).toContain(token)
      expect(authLayout).toContain(token)
    }
  })

  it("announces itself as loading rather than as a logo", () => {
    const src = read("components/skeletons/boot-screen.tsx")
    expect(src).toContain('role="status"')
    expect(src).toContain('aria-busy="true"')
    expect(src).toContain("sr-only")
  })
})
