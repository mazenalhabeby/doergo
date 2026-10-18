/**
 * @jest-environment node
 */
import { renderToStaticMarkup } from "react-dom/server"
import { approvalDays, toApproval, type ApprovalContext } from "@hbcfield/shared/client"
import { DayRow } from "../_components/day-row"
import { DayPanel } from "../_components/day-panel"

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o ? `${k} ${JSON.stringify(o)}` : k),
    i18n: { language: "en" },
  }),
}))

/*
  A person's working day in the inbox: why it waits (shared label words), what it
  holds, and "Approve day" only when something can be approved without more input.
*/
const ctx: ApprovalContext = { now: new Date("2026-10-16T18:00:00Z"), me: "boss", mayDecide: () => true }
const mike = { id: "u", firstName: "Mike", lastName: "Weber" }
const space = { id: "s", name: "Warehouse", timezone: "Europe/Vienna" }
const hours = toApproval.hours(
  {
    id: "e1",
    user: mike,
    location: space,
    clockInAt: "2026-10-16T06:10:00Z",
    clockOutAt: "2026-10-16T15:00:00Z",
    flagReasons: ["LATE_ARRIVAL", "MISSED_BREAK"],
  },
  ctx,
)
const extra = toApproval.extraTime(
  { id: "e1", user: mike, location: space, clockInAt: "2026-10-16T06:10:00Z", status: "CLOCKED_OUT" },
  ctx,
)
const [day] = approvalDays([hours, extra])
const noop = () => {}

describe("a working day", () => {
  it("lists the reasons in the shared words and the other kinds it holds", () => {
    const html = renderToStaticMarkup(<DayRow day={day!} active={false} onSelect={noop} />)
    expect(html).toContain("Late")
    expect(html).toContain("Missed rest")
    expect(html).toContain("approvals.kinds.extraTime")
  })

  it("offers Approve day for the hours and says extra time needs minutes", () => {
    const html = renderToStaticMarkup(
      <DayPanel day={day!} members={[hours, extra]} busy={false} onApprove={noop} onReview={noop} />,
    )
    expect(html).toContain("approvals.day.approve")
    expect(html).toContain("approvals.day.needsMinutes")
  })

  it("no Approve day when nothing can be approved in one go", () => {
    const html = renderToStaticMarkup(
      <DayPanel
        day={{ ...day!, approvable: [] }}
        members={[hours, extra]}
        busy={false}
        onApprove={noop}
        onReview={noop}
      />,
    )
    expect(html).not.toContain("approvals.day.approve<")
    expect(html).toContain("approvals.day.nothingToApprove")
  })
})
