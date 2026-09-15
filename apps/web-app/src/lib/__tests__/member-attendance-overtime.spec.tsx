/**
 * "Add overtime" on a member's own attendance tab.
 *
 * The attendance board already offered it; a manager who opened the member
 * first had to go and find the same shift somewhere else. What is pinned here:
 * the tab asks the SAME gate as the board (one rule, `mayOfferOvertime`), never
 * offers it on the viewer's own shifts, refreshes its own list after adding,
 * and renders the flags the board renders.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { TimeEntry } from '@/lib/api'
import { mayOfferOvertime, overtimeActionEnabled } from '../overtime-preview'

const auth = {
  user: { id: 'u-anna' } as { id: string } | null,
  perms: new Set<string>(['canApproveOvertime']),
  options: new Set<string>(['shift_scheduling']),
}

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    user: auth.user,
    hasPermission: (p: string) => auth.perms.has(p),
    hasPlanFeature: (f: string) => auth.options.has(f),
  }),
}))
// A declaration, so the hoisted mocks below can reach it.
function timeFormat() {
  return { hour12: false, locale: 'en-GB', formatTime: () => '08:00', formatDate: () => '14 Sep' }
}
jest.mock('@/hooks', () => ({ useTimeFormat: () => timeFormat() }))
jest.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => timeFormat() }))
jest.mock('@/lib/api', () => ({ attendanceApi: { addOvertime: jest.fn(async () => ({})) } }))
jest.mock('@/lib/toast', () => ({ notify: { success: jest.fn(), error: jest.fn() } }))
jest.mock('@/components/worklog-timeline', () => ({ WorkLogTimeline: () => null }))
jest.mock('../../app/(dashboard)/members/[id]/_components/add-attendance-dialog', () => ({
  AddAttendanceDialog: () => null,
}))

// eslint-disable-next-line import/first
import { AttendanceTab } from '../../app/(dashboard)/members/[id]/_components/attendance-tab'
// eslint-disable-next-line import/first
import { attendanceApi } from '@/lib/api'

const shift = (over: Partial<TimeEntry> = {}): TimeEntry =>
  ({
    id: 'e1',
    userId: 'u-karim',
    status: 'CLOCKED_OUT',
    approvalStatus: 'AUTO',
    clockInAt: '2026-09-14T06:00:00.000Z',
    expectedClockOutAt: '2026-09-14T15:00:00.000Z',
    clockOutAt: '2026-09-14T16:40:00.000Z',
    totalMinutes: 640,
    paidMinutes: 540,
    breakMinutes: 0,
    flagReasons: [],
    location: { name: 'Depot', timezone: 'Europe/Vienna' },
    ...over,
  }) as unknown as TimeEntry

let container: HTMLDivElement
let root: Root
let client: QueryClient
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  auth.user = { id: 'u-anna' }
  auth.perms = new Set(['canApproveOvertime'])
  auth.options = new Set(['shift_scheduling'])
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
})

async function render(entries: TimeEntry[], employeeId = 'u-karim') {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <AttendanceTab attendance={entries} employeeId={employeeId} employeeName="Karim Ahmad" canManage />
      </QueryClientProvider>,
    )
  })
}
const addButtons = () => container.querySelectorAll('button[aria-label="attendance.addOvertime.action"]')

describe('the gate, as a rule', () => {
  const viewer = { userId: 'u-anna', canApprove: true, hasOption: true }

  it('needs the approval permission AND the Option', () => {
    expect(overtimeActionEnabled(viewer)).toBe(true)
    expect(overtimeActionEnabled({ ...viewer, canApprove: false })).toBe(false)
    expect(overtimeActionEnabled({ ...viewer, hasOption: false })).toBe(false)
  })

  it('is never offered on the viewer’s own shift', () => {
    expect(mayOfferOvertime(shift(), viewer)).toBe(true)
    expect(mayOfferOvertime(shift({ userId: 'u-anna' }), viewer)).toBe(false)
    // Entries that carry only the nested user are recognised too.
    expect(mayOfferOvertime(shift({ userId: undefined, user: { id: 'u-anna' } } as never), viewer)).toBe(false)
  })

  it('is offered only on a closed shift with a planned end', () => {
    expect(mayOfferOvertime(shift({ status: 'CLOCKED_IN' as TimeEntry['status'], clockOutAt: null }), viewer)).toBe(false)
    expect(mayOfferOvertime(shift({ expectedClockOutAt: null }), viewer)).toBe(false)
  })
})

describe('a member’s attendance tab', () => {
  it('offers "Add overtime" on a closed shift to somebody who may approve it', async () => {
    await render([shift(), shift({ id: 'e2', status: 'CLOCKED_IN' as TimeEntry['status'], clockOutAt: null })])
    expect(addButtons()).toHaveLength(1)
  })

  it('does not offer it without the permission, or without the Option', async () => {
    auth.perms = new Set()
    await render([shift()])
    expect(addButtons()).toHaveLength(0)

    auth.perms = new Set(['canApproveOvertime'])
    auth.options = new Set()
    await render([shift()])
    expect(addButtons()).toHaveLength(0)
  })

  it('does not offer it on the viewer’s own profile', async () => {
    await render([shift({ userId: 'u-anna' })], 'u-anna')
    expect(addButtons()).toHaveLength(0)
    // …and adds no empty column for it either.
    expect(container.querySelectorAll('thead th')).toHaveLength(7)
  })

  it('refreshes this tab’s list after adding', async () => {
    const invalidate = jest.spyOn(client, 'invalidateQueries')
    await render([shift()])
    const trigger = addButtons()[0] as HTMLButtonElement
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const approve = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('attendance.addOvertime.approve'),
    ) as HTMLButtonElement
    expect(approve).toBeDefined()
    await act(async () => {
      approve.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(attendanceApi.addOvertime).toHaveBeenCalledWith('e1', expect.objectContaining({ minutes: 100 }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['memberAttendance'] })
  })

  it('renders the unconfirmed clock-out and daily-limit flags the board renders', async () => {
    await render([shift({ flagReasons: ['CLOCK_OUT_PROVISIONAL', 'PAST_DAILY_LIMIT'] })])
    const text = container.textContent ?? ''
    expect(text).toContain('technicians.attendanceTab.flag.clockOutProvisional')
    expect(text).toContain('technicians.attendanceTab.flag.pastDailyLimit')
  })
})
