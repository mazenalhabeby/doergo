import fs from "fs"
import path from "path"
import { APPROVAL_KINDS, describeApproval, type ApprovalItem, type ApprovalT } from "@hbcfield/shared/client"
import { mayOpen, type AccessContext, type AccessUser } from "@/lib/route-access"

/*
  The approvals inbox on the web: who is offered it, and that every kind it can
  show has words in every language.
*/

const ctx = (user: Partial<AccessUser>): AccessContext => ({
  user: { role: "EMPLOYEE", access: { org: {}, perSpace: {} }, ...user } as AccessUser,
  hasOption: () => true,
})

describe("who is offered /approvals", () => {
  it("an administrator", () => {
    expect(mayOpen("/approvals", ctx({ role: "ADMIN" }))).toBe(true)
  })
  it("a member who can approve hours in ONE workspace", () => {
    expect(mayOpen("/approvals", ctx({ access: { org: {}, perSpace: { s1: { canApproveAttendance: true } } } }))).toBe(true)
  })
  it("a member who can decide nothing is not", () => {
    expect(mayOpen("/approvals", ctx({ access: { org: { canViewAllTasks: true }, perSpace: { s1: { canViewSpaceAttendance: true } } } }))).toBe(false)
  })
  it("an org-wide kind held only in a workspace does not count (documents are org-wide)", () => {
    expect(mayOpen("/approvals", ctx({ access: { org: {}, perSpace: { s1: { canIssueDocuments: true } } } }))).toBe(false)
  })
})

const locales = path.join(__dirname, "..", "..", "..", "..", "i18n", "locales")
const keyed = (o: unknown, k: string): unknown => k.split(".").reduce<unknown>((a, p) => (a as Record<string, unknown> | undefined)?.[p], o)

describe("every kind has words in every language", () => {
  for (const file of fs.readdirSync(locales).filter((f) => f.endsWith(".json"))) {
    const json = JSON.parse(fs.readFileSync(path.join(locales, file), "utf8"))
    it(file, () => {
      for (const k of APPROVAL_KINDS) {
        expect(typeof keyed(json, `approvals.kinds.${k}`)).toBe("string")
      }
    })
  }
})

describe("describeApproval", () => {
  const en = JSON.parse(fs.readFileSync(path.join(locales, "en.json"), "utf8"))
  const t = ((key: string, opts?: Record<string, unknown>) => {
    const v = keyed(en, key)
    if (typeof v !== "string") return (opts?.defaultValue as string) ?? key
    return v.replace(/\{\{(\w+)\}\}/g, (_, n: string) => String(opts?.[n] ?? ""))
  }) as ApprovalT
  const base = (kind: ApprovalItem["kind"], data: ApprovalItem["data"]): ApprovalItem => ({
    kind, id: "x", subject: { id: "u", name: "Ana Ruiz", avatarUrl: null }, space: null,
    raisedAt: null, dueAt: null, group: "LATER", canDecide: true, data,
  })

  it("names every kind without a raw key", () => {
    for (const k of APPROVAL_KINDS) {
      const { headline } = describeApproval(base(k, {}), t, "en")
      expect(headline).not.toMatch(/^approvals\./)
      expect(headline.length).toBeGreaterThan(0)
    }
  })

  it("a cover floor of 0 is 'not set', never '0 needed'", () => {
    const facts = describeApproval(base("request", { coverLevel: "tight", coverWorst: 2, coverFloor: 0 }), t, "en").facts
    expect(facts.find((f) => f.label === "Cover")?.value).toBe("Cover gets tight")
  })

  it("a leave request reads its type, other requests their kind", () => {
    expect(describeApproval(base("request", { requestKind: "LEAVE", type: "SICK" }), t, "en").headline).toBe("Sick")
    expect(describeApproval(base("request", { requestKind: "REMOTE" }), t, "en").headline).toBe("Remote day")
  })
})
