import { clientRecordActions } from "@/lib/crm-record-actions"

/* The client record offers what CustomersService.update / assertCrmReach accept, and no more. */
describe("client record actions follow the server's CRM caps", () => {
  it("read-only: nothing to press", () => {
    expect(clientRecordActions({ work: false, editInfo: false, manage: false }, false)).toEqual({
      editInfo: false, setStage: false, work: false, assignManagers: false, invite: false,
    })
  })
  it("work: stage, notes, reminders — not the record's details, managers or the invite", () => {
    expect(clientRecordActions({ work: true }, false)).toEqual({
      editInfo: false, setStage: true, work: true, assignManagers: false, invite: false,
    })
  })
  it("editInfo: the details only", () => {
    expect(clientRecordActions({ editInfo: true }, false)).toMatchObject({ editInfo: true, setStage: false, work: false })
  })
  it("manage: everything", () => {
    expect(Object.values(clientRecordActions({ manage: true }, false)).every(Boolean)).toBe(true)
  })
  it("a client with app access is manage-only, whatever else is held", () => {
    expect(Object.values(clientRecordActions({ work: true, editInfo: true }, true)).some(Boolean)).toBe(false)
    expect(Object.values(clientRecordActions({ manage: true }, true)).every(Boolean)).toBe(true)
  })
  it("no caps at all: nothing", () => {
    expect(Object.values(clientRecordActions(undefined, false)).some(Boolean)).toBe(false)
  })
})
