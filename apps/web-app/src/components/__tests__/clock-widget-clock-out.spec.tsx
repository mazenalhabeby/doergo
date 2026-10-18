/**
 * Clocking OUT from the navbar pill.
 *
 * Three bugs, each of which made the one action that must always work fail:
 * the early-leave dialog was rendered only while clocked OUT, so pressing
 * Clock Out short of the shift end opened nothing; a confirmed early clock-out
 * announced "Clocked in"; and a billing lock disabled Clock Out although the
 * server lets a shift end on a read-only account.
 */
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { isClockOutAction, clockOutPosition } from "@/hooks/clock-action"

const state = {
  clockedIn: true,
  earlyOpen: false,
  billingLocked: true,
  clockOut: jest.fn(),
}

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, d?: unknown) => (typeof d === "string" ? d : key) }),
}))
jest.mock("@/contexts/auth-context", () => ({ useAuth: () => ({ user: { id: "u-1", role: "EMPLOYEE" } }) }))
jest.mock("@hbcfield/shared/client", () => ({ hasAccessModule: () => true }))
jest.mock("@/components/clock-in-picker", () => ({ ClockInPicker: () => null }))
jest.mock("@/components/attendance/clock-out-early-dialog", () => ({
  ClockOutEarlyDialog: (p: { open: boolean }) => (p.open ? <div data-testid="early-dialog" /> : null),
}))
jest.mock("@/hooks", () => ({
  useBillingLock: () => ({ locked: state.billingLocked, reason: "Read-only" }),
  useClockIn: () => ({
    clockedIn: state.clockedIn,
    activeEntry: { clockInAt: new Date().toISOString(), location: { name: "Warehouse" } },
    pending: false,
    startClockIn: jest.fn(),
    clockOut: state.clockOut,
    pickerProps: {},
    earlyProps: { open: state.earlyOpen },
  }),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ClockWidget } = require("../clock-widget") as typeof import("../clock-widget")

let root: Root
let host: HTMLDivElement
function render() {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<ClockWidget />))
}
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})
// React 18+ act() warnings off for a plain DOM render.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe("navbar clock-out", () => {
  it("shows the early-leave dialog while CLOCKED IN, where Clock Out opens it", () => {
    state.clockedIn = true
    state.earlyOpen = true
    render()
    expect(host.querySelector('[data-testid="early-dialog"]')).not.toBeNull()
  })

  it("keeps Clock Out enabled under a billing lock", () => {
    state.earlyOpen = false
    state.billingLocked = true
    render()
    const button = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Clock Out"))
    expect(button).toBeDefined()
    expect(button!.disabled).toBe(false)
  })
})

describe("clock actions", () => {
  it('treats an early clock-out as a clock-out (it used to announce "Clocked in")', () => {
    expect(isClockOutAction("out")).toBe(true)
    expect(isClockOutAction({ out: true, earlyReason: "Doctor" })).toBe(true)
    expect(isClockOutAction("remote")).toBe(false)
    expect(isClockOutAction({ locationId: "sp-1" })).toBe(false)
  })

  it("ends a shift without a browser position instead of failing", async () => {
    await expect(
      clockOutPosition(async () => {
        throw new Error("denied")
      }),
    ).resolves.toBeNull()
    await expect(clockOutPosition(async () => ({ lat: 1, lng: 2 }))).resolves.toEqual({ lat: 1, lng: 2 })
  })
})
