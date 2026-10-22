import path from "path"
import { readFolder } from "../../test-utils/read-source"

/**
 * The clock event no longer carries `clockInPlace` / `clockOutPlace` — the
 * reverse-geocoded address of where somebody clocked in is not broadcast to the
 * whole organization any more. A screen still reading them would show nothing
 * today and would quietly start showing addresses again the day somebody put
 * the fields back on the event "because the bell expects them".
 */
describe("notification bell — clock events", () => {
  it("reads no clock-in / clock-out address from the event", () => {
    const src = readFolder(path.join(__dirname, "../notifications"))
    expect(src).not.toMatch(/clockInPlace|clockOutPlace/)
  })
})
