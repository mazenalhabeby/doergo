import fs from "fs"
import path from "path"

/**
 * The clock event no longer carries `clockInPlace` / `clockOutPlace` — the
 * reverse-geocoded address of where somebody clocked in is not broadcast to the
 * whole organization any more. A screen still reading them would show nothing
 * today and would quietly start showing addresses again the day somebody put
 * the fields back on the event "because the bell expects them".
 */
describe("notification bell — clock events", () => {
  it("reads no clock-in / clock-out address from the event", () => {
    const src = fs.readFileSync(path.join(__dirname, "../notifications/notification-bell.tsx"), "utf8")
    expect(src).not.toMatch(/clockInPlace|clockOutPlace/)
  })
})
