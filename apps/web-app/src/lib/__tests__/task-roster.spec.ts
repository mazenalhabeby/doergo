import { taskRoster } from "../task-roster"

const person = (id: string, role: "LEAD" | "MEMBER" = "MEMBER") => ({
  role,
  user: { id, firstName: id.toUpperCase(), lastName: "Doe", avatarUrl: null },
})

describe("taskRoster", () => {
  it("returns nobody for an unassigned task", () => {
    expect(taskRoster([], null)).toEqual([])
    expect(taskRoster(undefined, undefined)).toEqual([])
  })

  it("falls back to the legacy single assignee, who is the lead", () => {
    const roster = taskRoster([], { id: "u1", firstName: "Mike", lastName: "Weber" })
    expect(roster).toEqual([
      { id: "u1", firstName: "Mike", lastName: "Weber", avatarUrl: undefined, isLead: true },
    ])
  })

  it("ignores a legacy assignee with no id — there is nobody to message", () => {
    expect(taskRoster([], { firstName: "Ghost", lastName: "User" })).toEqual([])
  })

  it("puts the lead first no matter where the row sits", () => {
    const roster = taskRoster([person("a"), person("b"), person("c", "LEAD")], null)
    expect(roster.map(p => p.id)).toEqual(["c", "a", "b"])
    expect(roster[0].isLead).toBe(true)
    expect(roster.slice(1).every(p => !p.isLead)).toBe(true)
  })

  it("keeps the given order when no one is marked lead", () => {
    expect(taskRoster([person("a"), person("b")], null).map(p => p.id)).toEqual(["a", "b"])
  })

  it("lists every assignee — the whole point of the picker", () => {
    // The bug this replaces offered exactly one person while the card beside it
    // showed three avatars.
    expect(taskRoster([person("a", "LEAD"), person("b"), person("c")], null)).toHaveLength(3)
  })

  it("never lists the same person twice", () => {
    const dupe = [person("a", "LEAD"), person("a")]
    expect(taskRoster(dupe, null).map(p => p.id)).toEqual(["a"])
  })

  it("prefers the assignee rows over the legacy field", () => {
    const roster = taskRoster([person("a", "LEAD")], { id: "legacy", firstName: "Old", lastName: "Field" })
    expect(roster.map(p => p.id)).toEqual(["a"])
  })

  it("carries the avatar through, so the picker can show faces", () => {
    const withAvatar = [{ role: "LEAD" as const, user: { id: "a", firstName: "A", lastName: "B", avatarUrl: "/a.png" } }]
    expect(taskRoster(withAvatar, null)[0].avatarUrl).toBe("/a.png")
  })
})
