import { QueryClient } from "@tanstack/react-query"

const list = jest.fn()
const getEffectiveModules = jest.fn()
jest.mock("@/lib/api", () => ({
  locationsApi: {
    list: (...a: unknown[]) => list(...a),
    getEffectiveModules: (...a: unknown[]) => getEffectiveModules(...a),
  },
}))

import { loadSpaceModules, spaceModulesFromDirectory, spaceDirectoryKey } from "../space-directory"
import { keys } from "../query-keys"

/**
 * A task list of nine workspaces asked `/locations/:id/modules` nine times in one
 * second. The workspace directory already carries each one's own modules and
 * workflow, so the answer is derived from it — with the server's rule.
 */
const ORG = ["subtasks", "checklists", "tracking"]
const directory = [
  { id: "a", name: "A", isActive: true, enabledModules: null, workflowId: null },
  { id: "b", name: "B", isActive: true, enabledModules: ["crm", "assets"], workflowId: "wf-b" },
  { id: "c", name: "C", isActive: false, enabledModules: [], workflowId: null },
]

describe("spaceModulesFromDirectory — the server's effectiveSpaceModules rule", () => {
  it("falls back to the organization's modules when the workspace has none of its own", () => {
    expect(spaceModulesFromDirectory(directory as never, "a", ORG)).toEqual({ enabledModules: ORG, workflowId: null })
  })
  it("uses the workspace's own list and workflow", () => {
    expect(spaceModulesFromDirectory(directory as never, "b", ORG)).toEqual({ enabledModules: ["crm", "assets"], workflowId: "wf-b" })
  })
  it("an EMPTY own list means none, not the organization's", () => {
    expect(spaceModulesFromDirectory(directory as never, "c", ORG)?.enabledModules).toEqual([])
  })
  it("returns null for a workspace the directory does not hold, or a row without the field", () => {
    expect(spaceModulesFromDirectory(directory as never, "zzz", ORG)).toBeNull()
    expect(spaceModulesFromDirectory([{ id: "a", name: "A" }] as never, "a", ORG)).toBeNull()
  })
})

describe("loadSpaceModules", () => {
  let qc: QueryClient
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    list.mockReset()
    getEffectiveModules.mockReset()
    list.mockResolvedValue({ data: directory, meta: { page: 1, totalPages: 1 } })
    getEffectiveModules.mockResolvedValue({ enabledModules: ["from-endpoint"], workflowId: null })
  })
  afterEach(() => qc.clear())

  it("answers many workspaces from ONE directory request", async () => {
    const answers = await Promise.all(["a", "b", "a", "b"].map((id) => loadSpaceModules(qc, id, ORG)))
    expect(list).toHaveBeenCalledTimes(1)
    expect(getEffectiveModules).not.toHaveBeenCalled()
    expect(answers[1]).toEqual({ enabledModules: ["crm", "assets"], workflowId: "wf-b" })
    expect(qc.getQueryData(spaceDirectoryKey())).toHaveLength(3)
  })

  it("reuses a directory already in the cache", async () => {
    qc.setQueryData(spaceDirectoryKey(), directory)
    await loadSpaceModules(qc, "a", ORG)
    expect(list).not.toHaveBeenCalled()
  })

  it("asks the workspace itself when the directory does not hold it", async () => {
    const r = await loadSpaceModules(qc, "elsewhere", ORG)
    expect(getEffectiveModules).toHaveBeenCalledWith("elsewhere")
    expect(r).toEqual({ enabledModules: ["from-endpoint"], workflowId: null })
  })

  it("asks the workspace itself when the directory cannot be read", async () => {
    list.mockRejectedValue(new Error("403"))
    const r = await loadSpaceModules(qc, "a", ORG)
    expect(getEffectiveModules).toHaveBeenCalledWith("a")
    expect(r?.enabledModules).toEqual(["from-endpoint"])
  })

  it("a REFETCH (an answer is already held) goes to the workspace's own endpoint", async () => {
    qc.setQueryData(spaceDirectoryKey(), directory)
    qc.setQueryData(keys.spaces.modules("a"), { enabledModules: ORG, workflowId: null })
    await loadSpaceModules(qc, "a", ORG)
    expect(getEffectiveModules).toHaveBeenCalledWith("a")
  })

  it("the directory key sits under the locations lists, so every space mutation refreshes it", () => {
    const prefix = keys.locations.lists()
    expect(spaceDirectoryKey().slice(0, prefix.length)).toEqual([...prefix])
  })
})
