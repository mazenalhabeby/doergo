import { mayListOrgMembers, memberSourceFor, peopleFromRosters, personFromMember } from "@/lib/assignable-members"
import type { LocationAssignment, OrgMember } from "@/lib/api"

describe("who may read the organization directory (GET /organizations/members)", () => {
  it("an admin, or whoever holds the flat canManageUsers flag", () => {
    expect(mayListOrgMembers({ role: "ADMIN" })).toBe(true)
    expect(mayListOrgMembers({ role: "CLIENT" })).toBe(true) // legacy admin
    expect(mayListOrgMembers({ role: "EMPLOYEE", canManageUsers: true })).toBe(true)
  })
  it("NOT a manager or dispatcher who only assigns work — the request would 403", () => {
    expect(mayListOrgMembers({ role: "EMPLOYEE", canManageUsers: false })).toBe(false)
    expect(mayListOrgMembers({ role: "EMPLOYEE" })).toBe(false)
    expect(mayListOrgMembers(null)).toBe(false)
  })
})

describe("which list a picker asks for", () => {
  it("directory readers get the directory", () => {
    expect(memberSourceFor({ mayListOrg: true, spaceId: "s1" })).toBe("directory")
    expect(memberSourceFor({ mayListOrg: true })).toBe("directory")
  })
  it("everybody else: the workspace roster when there is a workspace", () => {
    expect(memberSourceFor({ mayListOrg: false, spaceId: "s1" })).toBe("space")
  })
  it("everybody else without a workspace: the rosters they can see", () => {
    expect(memberSourceFor({ mayListOrg: false, spaceId: null })).toBe("visible-spaces")
  })
  it("rosterOnly keeps a known workspace's people even for a directory reader", () => {
    expect(memberSourceFor({ mayListOrg: true, spaceId: "s1", rosterOnly: true })).toBe("space")
    expect(memberSourceFor({ mayListOrg: true, spaceId: null, rosterOnly: true })).toBe("directory")
  })
})

describe("people from rosters", () => {
  const row = (userId: string, locationId: string, user?: Partial<NonNullable<LocationAssignment["user"]>>) =>
    ({ id: `${userId}-${locationId}`, userId, locationId, user: user ? { id: userId, firstName: "A", lastName: userId, email: `${userId}@x`, ...user } : undefined }) as LocationAssignment

  it("each person once, in roster order, skipping rows without a user", () => {
    const out = peopleFromRosters([row("u1", "s1", {}), row("u2", "s1", {}), row("u1", "s2", {}), row("u3", "s2")])
    expect(out.map((p) => p.id)).toEqual(["u1", "u2"])
    expect(out[0]).toMatchObject({ firstName: "A", lastName: "u1", email: "u1@x", isActive: true })
  })
  it("a directory row keeps its title fields", () => {
    const p = personFromMember({ id: "m", firstName: "M", lastName: "N", email: "m@x", role: "EMPLOYEE", isActive: true, position: "Plumber", createdAt: "" } as unknown as OrgMember)
    expect(p).toMatchObject({ id: "m", position: "Plumber", role: "EMPLOYEE", isActive: true })
  })
})
