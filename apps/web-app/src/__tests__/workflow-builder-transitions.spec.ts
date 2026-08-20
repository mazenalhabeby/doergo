import { readFileSync } from "fs"
import { join } from "path"
import { validateWorkflow } from "@hbcfield/shared/client"
import { resolveTransitions, linearTransitions, toStatusKey } from "@/lib/workflow-transitions"

/**
 * The space's builder edits names, colours, marks and capabilities — it has no
 * transition control. That leaves two silent ways to get transitions wrong, and
 * this file exists because BOTH have shipped:
 *
 *   - writing none at all → the validator reads every step as a dead end and
 *     refuses the task type when somebody tries to offer it. Created, then
 *     permanently unusable.
 *   - regenerating a chain on every save → branching from a library template is
 *     flattened. A forked Field Service flow has Blocked → In Progress; lose it
 *     and a task sitting in Blocked has nowhere to go.
 *
 * These import the real module rather than a copy. An earlier version of this
 * file reimplemented the helper locally and passed happily while the component
 * was broken.
 */
const build = (statuses: { name: string; isFinal: boolean; isCanceled: boolean; transitions?: string[] }[]) =>
  statuses.map((s, i) => ({
    key: toStatusKey(s.name),
    name: s.name,
    position: i,
    isFinal: s.isFinal,
    isCanceled: s.isCanceled,
    transitions: resolveTransitions(statuses, i),
  }))

describe("the builder produces a usable task type", () => {
  it("wires a plain three-step flow end to end", () => {
    expect(
      validateWorkflow(
        build([
          { name: "Open", isFinal: false, isCanceled: false },
          { name: "In Progress", isFinal: false, isCanceled: false },
          { name: "Done", isFinal: true, isCanceled: false },
        ]),
      ),
    ).toEqual([])
  })

  it("keeps a cancel step reachable from every working step", () => {
    const flow = build([
      { name: "Open", isFinal: false, isCanceled: false },
      { name: "Working", isFinal: false, isCanceled: false },
      { name: "Done", isFinal: true, isCanceled: false },
      { name: "Canceled", isFinal: false, isCanceled: true },
    ])
    expect(validateWorkflow(flow)).toEqual([])
    expect(flow[0]!.transitions).toContain("CANCELED")
    // The chain skips the cancel step rather than routing work through it.
    expect(flow[0]!.transitions).toContain("WORKING")
  })

  it("does not send a cancel step to itself", () => {
    const flow = build([
      { name: "Open", isFinal: false, isCanceled: false },
      { name: "Done", isFinal: true, isCanceled: false },
      { name: "Canceled", isFinal: false, isCanceled: true },
    ])
    expect(flow[2]!.transitions).toEqual([])
  })

  it("would have been refused before the chain existed", () => {
    const noTransitions = [
      { key: "OPEN", name: "Open", position: 0, isFinal: false, isCanceled: false, transitions: [] },
      { key: "DONE", name: "Done", position: 1, isFinal: true, isCanceled: false, transitions: [] },
    ]
    expect(validateWorkflow(noTransitions).map((p) => p.code)).toContain("dead_end")
  })
})

describe("branching survives an edit", () => {
  const forked = [
    { name: "In Progress", isFinal: false, isCanceled: false, transitions: ["BLOCKED", "DONE"] },
    { name: "Blocked", isFinal: false, isCanceled: false, transitions: ["IN_PROGRESS"] },
    { name: "Done", isFinal: true, isCanceled: false, transitions: [] },
  ]

  it("keeps what a step already declares", () => {
    expect(resolveTransitions(forked, 0)).toEqual(["BLOCKED", "DONE"])
    expect(resolveTransitions(forked, 1)).toEqual(["IN_PROGRESS"])
  })

  it("differs from the chain it would otherwise have written", () => {
    // Names the loss precisely: the chain has no way back out of Blocked.
    expect(linearTransitions(forked, 1)).not.toContain("IN_PROGRESS")
  })

  it("still wires a brand-new step that declares nothing", () => {
    expect(
      resolveTransitions(
        [
          { name: "Open", isFinal: false, isCanceled: false },
          { name: "Done", isFinal: true, isCanceled: false },
        ],
        0,
      ),
    ).toEqual(["DONE"])
  })
})

describe("the component uses it", () => {
  const src = readFileSync(
    join(__dirname, "../app/(dashboard)/locations/_components/workflow-builder.tsx"),
    "utf8",
  )

  it("calls the resolver on every write path", () => {
    // A correct helper nobody calls is not a fix.
    expect((src.match(/transitions: resolveTransitions\(/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it("never wires the raw chain straight into a write", () => {
    expect(src).not.toMatch(/transitions: linearTransitions\(/)
  })

  it("does not keep a private copy of the key form", () => {
    // The keys a status is stored under and the keys transitions point at have
    // to be produced by the same function, or every transition is a dead link.
    expect(src).toMatch(/toStatusKey/)
    expect(src).not.toMatch(/function toKey\(/)
  })
})
