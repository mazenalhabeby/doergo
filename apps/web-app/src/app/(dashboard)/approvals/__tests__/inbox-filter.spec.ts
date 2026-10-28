import { matchesApprovalFilter, type ApprovalItem } from "@hbcfield/shared/client"
import { filterAfterRead, filterFromQuery } from "../_lib/inbox-filter"

/* The rail's filter: read from a link, kept or dropped as the list changes, and what it keeps. */

type Step = NonNullable<ApprovalItem["step"]>
const waiting = {
  step: { firstById: "u1", firstByName: "Anna", roleName: "HR", mine: false, waitsForYou: true } as Step,
}
const halfway = { step: { firstById: "u1", firstByName: "Anna", roleName: "HR", mine: false } as Step }
const plain = { step: undefined }

describe("a link's ?kind=", () => {
  it("waitsForYou, and the old name 'yours' in links already sent", () => {
    expect(filterFromQuery("waitsForYou")).toBe("waitsForYou")
    expect(filterFromQuery("yours")).toBe("waitsForYou")
  })
  it("a kind", () => expect(filterFromQuery("overtime")).toBe("overtime"))
  it("nothing or nonsense is no filter", () => {
    expect(filterFromQuery(null)).toBeNull()
    expect(filterFromQuery("everything")).toBeNull()
  })
})

describe("after the list is read again", () => {
  it("the last item waiting for the reader decided: back to everything", () => {
    expect(filterAfterRead("waitsForYou", [halfway, plain])).toBe("all")
    expect(filterAfterRead("waitsForYou", [])).toBe("all")
  })
  it("kept while one still waits for the reader", () => {
    expect(filterAfterRead("waitsForYou", [plain, waiting])).toBe("waitsForYou")
  })
  it("kept while the list is not read yet", () => expect(filterAfterRead("waitsForYou", undefined)).toBe("waitsForYou"))
  it("a kind or everything is never changed", () => {
    expect(filterAfterRead("overtime", [])).toBe("overtime")
    expect(filterAfterRead("all", [])).toBe("all")
  })
})

describe("what the filter keeps (shared rule)", () => {
  const item = (s: { step?: Step }, kind = "overtime") => ({ kind, ...s }) as Pick<ApprovalItem, "kind" | "step">
  it("waitsForYou keeps only what waits for the reader", () => {
    expect(matchesApprovalFilter(item(waiting), "waitsForYou")).toBe(true)
    expect(matchesApprovalFilter(item(halfway), "waitsForYou")).toBe(false)
    expect(matchesApprovalFilter(item(plain), "waitsForYou")).toBe(false)
  })
  it("a kind and everything", () => {
    expect(matchesApprovalFilter(item(plain), "overtime")).toBe(true)
    expect(matchesApprovalFilter(item(plain), "hours")).toBe(false)
    expect(matchesApprovalFilter(item(plain), "all")).toBe(true)
  })
})
