import type { ApprovalDay, ApprovalItem } from "@hbcfield/shared/client"
import { listOrder } from "../_lib/list-order"

/* The order ↑ / ↓ walk and "next after a decision" follow: per group (now, today, later), days before items. */

const day = (key: string, group: ApprovalDay["group"]) => ({ key, group }) as ApprovalDay
const item = (id: string, group: ApprovalItem["group"], kind = "hours") => ({ id, kind, group }) as ApprovalItem

describe("the list's order", () => {
  it("groups in order, a group's days before its items, each in the order given", () => {
    const days = [day("day:b", "LATER"), day("day:a", "TODAY")]
    const items = [item("3", "LATER"), item("1", "NOW", "overtime"), item("2", "TODAY"), item("4", "TODAY")]
    expect(listOrder(days, items)).toEqual(["overtime:1", "day:a", "hours:2", "hours:4", "day:b", "hours:3"])
  })
  it("empty when there is nothing", () => expect(listOrder([], [])).toEqual([]))
})
