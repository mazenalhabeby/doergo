import path from "path"
import { readSource } from "../../../../../test-utils/read-source"

/*
  "Workspace default ()": the label looked the workspace's flow up only among the
  types the workspace OFFERS, and its own default is not always one of them.
  The form hook now resolves the name (offered list → the organization's list →
  fetched by id) and the picker prints nothing — never "()" — until it is known.
*/
// readSource: the file plus the parts split out of it (the form hook's task-type part lives beside it).
const read = (p: string) => readSource(path.join(__dirname, "..", p))

describe("task type picker — the workspace default by name", () => {
  it("the picker reads a resolved name and never prints empty brackets", () => {
    const src = read("create-task/workspace-type-fields.tsx")
    expect(src).toMatch(/spaceWorkflowName \? ` \(\$\{spaceWorkflowName\}\)` : ""/)
    expect(src).not.toMatch(/\?\.name \?\? ""\}\)/)
  })

  it("the form hook falls back to the organization's list, then fetches the flow", () => {
    const src = read("create-task/use-create-task-form.ts")
    expect(src).toMatch(/orgWorkflows\?\.find\(\(w\) => w\.id === spaceWorkflowId\)/)
    expect(src).toMatch(/workflowsApi\.getById\(spaceWorkflowId!\)/)
    expect(src).toMatch(/enabled: open && !!spaceWorkflowId && !knownSpaceWorkflowName/)
  })
})
