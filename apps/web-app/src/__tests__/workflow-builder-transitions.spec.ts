import { readFileSync } from "fs"
import { join } from "path"
import { validateWorkflow } from "@hbcfield/shared/client"

/**
 * The simple builder must not create a task type that cannot be used.
 *
 * It has no transition editor, and used to write statuses with none at all.
 * That was harmless until the validator arrived: a step with no way out and no
 * "finished" mark is a dead end, so the whole type is refused the moment
 * somebody offers it in a space. Created, then permanently unusable — a worse
 * outcome than being unable to create it.
 *
 * The chain it writes is reproduced here from the same rule the component uses,
 * and the SOURCE is asserted to still call it, because a passing chain proves
 * nothing if nobody sends it.
 */
function linearTransitions(
  statuses: { name: string; isFinal: boolean; isCanceled: boolean }[],
  index: number,
): string[] {
  const toKey = (n: string) => n.trim().toUpperCase().replace(/\s+/g, "_")
  const current = statuses[index]
  if (!current || current.isFinal || current.isCanceled) return []
  const out: string[] = []
  const next = statuses.slice(index + 1).find((s) => !s.isCanceled)
  if (next) out.push(toKey(next.name))
  const cancel = statuses.find((s) => s.isCanceled)
  if (cancel && cancel !== current) out.push(toKey(cancel.name))
  return out
}

const build = (statuses: { name: string; isFinal: boolean; isCanceled: boolean }[]) =>
  statuses.map((s, i) => ({
    key: s.name.trim().toUpperCase().replace(/\s+/g, "_"),
    name: s.name,
    position: i,
    isFinal: s.isFinal,
    isCanceled: s.isCanceled,
    transitions: linearTransitions(statuses, i),
  }))

describe("the simple builder produces a usable task type", () => {
  it("wires a plain three-step flow end to end", () => {
    const flow = build([
      { name: "Open", isFinal: false, isCanceled: false },
      { name: "In Progress", isFinal: false, isCanceled: false },
      { name: "Done", isFinal: true, isCanceled: false },
    ])
    expect(validateWorkflow(flow)).toEqual([])
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

  it("would have been refused before this fix", () => {
    // The old behaviour, asserted so the regression is legible.
    const noTransitions = [
      { key: "OPEN", name: "Open", position: 0, isFinal: false, isCanceled: false, transitions: [] },
      { key: "DONE", name: "Done", position: 1, isFinal: true, isCanceled: false, transitions: [] },
    ]
    const codes = validateWorkflow(noTransitions).map((p) => p.code)
    expect(codes).toContain("dead_end")
  })

  it("is actually wired into both write paths in the component", () => {
    // A correct helper nobody calls is not a fix.
    const src = readFileSync(
      join(__dirname, "../app/(dashboard)/locations/_components/workflow-builder.tsx"),
      "utf8",
    )
    const calls = src.match(/transitions: linearTransitions\(/g) ?? []
    expect(calls.length).toBeGreaterThanOrEqual(2)
  })
})
