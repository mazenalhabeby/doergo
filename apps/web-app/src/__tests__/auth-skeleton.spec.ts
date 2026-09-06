import { readFileSync } from "fs"
import { join } from "path"

/*
  The sign-in page's own wait.

  ⚠️ It drew the PREVIOUS design — a centred 900px card with a mobile tab bar and
  a footer — while the page had been a full-bleed two-panel layout for some time.
  So the wait showed one page and the arrival was another, rearranging the whole
  screen every time anybody signed in.

  A skeleton is a promise about the layout that follows. These check it is still
  making the right one, because the page will change again and the skeleton is
  the thing nobody remembers to change with it.
*/
const SRC = join(__dirname, "..")
const skeleton = readFileSync(join(SRC, "components/auth/auth-skeleton.tsx"), "utf8")
const page = readFileSync(join(SRC, "app/(auth)/login/page.tsx"), "utf8")

describe("the sign-in skeleton matches the sign-in page", () => {
  it("uses the page's own frame", () => {
    // Full-bleed and fixed, not a centred card — the difference that made the
    // arrival a rearrangement.
    for (const token of ["force-light", "fixed inset-0", "lg:flex-row"]) {
      expect(skeleton).toContain(token)
      expect(page).toContain(token)
    }
    expect(skeleton).not.toContain("max-w-[900px]")
  })

  it("splits at the same width, and hides the hero at the same breakpoint", () => {
    // 54% is the hero's share on a wide screen; below lg it is gone and the
    // logo takes its place, in both files.
    for (const token of ["lg:w-[54%]", "hidden", "lg:hidden"]) {
      expect(skeleton).toContain(token)
      expect(page).toContain(token)
    }
  })

  it("keeps the form column's measurements", () => {
    for (const token of ["max-w-md", "px-6 py-12 sm:px-10 lg:px-16", "rounded-[10px] bg-slate-100 p-1"]) {
      expect(skeleton).toContain(token)
      expect(page).toContain(token)
    }
  })

  it("shimmers light on the dark side", () => {
    /*
      A slate block on the dark hero reads as a hole punched in it. The hero has
      its own shimmer on white at low opacity — the only place the two halves of
      this page need different treatment.
    */
    expect(skeleton).toContain("bg-white/15")
    expect(skeleton).toContain("bg-slate-200")
  })
})
