/**
 * Approvals: the shifts recorded without signal, on their own.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { TimeEntry } from '@/lib/api'
import { recordedOffline } from '../attendance-status'

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
jest.mock('@/hooks', () => ({ useTimeFormat: () => ({ hour12: false, locale: 'en-GB' }) }))

// eslint-disable-next-line import/first
import { ApprovalsTab } from '../../app/(dashboard)/attendance/_components/approvals-tab'

const entry = (id: string, first: string, flags: string[]): TimeEntry =>
  ({
    id, status: 'CLOCKED_OUT', approvalStatus: 'PENDING', flagReasons: flags,
    clockInAt: '2026-09-14T05:58:00.000Z', clockOutAt: '2026-09-14T14:31:00.000Z',
    breakMinutes: 0, user: { id: `u-${id}`, firstName: first, lastName: 'X' }, location: { name: 'Site', timezone: 'Europe/Vienna' },
  }) as unknown as TimeEntry

let container: HTMLDivElement
let root: Root
beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function render(entries: TimeEntry[]) {
  await act(async () => {
    root.render(
      <ApprovalsTab
        loading={false}
        data={{ data: entries }}
        onRefresh={() => undefined}
        onApprove={() => undefined}
        onReject={() => undefined}
        approving={false}
        rejecting={false}
      />,
    )
  })
}
const names = () => Array.from(container.querySelectorAll('tbody tr')).map((r) => r.textContent ?? '')
const filter = (label: string) =>
  Array.from(container.querySelectorAll('button[aria-pressed]')).find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined

describe('approvals: recorded offline', () => {
  it('reads the flag the server sets', () => {
    expect(recordedOffline({ flagReasons: ['LATE_ARRIVAL', 'RECORDED_OFFLINE'] })).toBe(true)
    expect(recordedOffline({ flagReasons: ['LATE_ARRIVAL'] })).toBe(false)
    expect(recordedOffline({ flagReasons: null })).toBe(false)
  })

  it('offers the filter with counts, and narrows the list to shifts recorded offline', async () => {
    await render([
      entry('1', 'Karim', ['RECORDED_OFFLINE', 'CLOCK_SUSPECT']),
      entry('2', 'Lisa', ['LATE_ARRIVAL']),
      entry('3', 'Noor', ['RECORDED_OFFLINE']),
    ])
    expect(names()).toHaveLength(3)
    expect(filter('attendance.approvals.filterAll')!.textContent).toContain('3')
    expect(filter('attendance.approvals.filterOffline')!.textContent).toContain('2')

    await act(async () => {
      filter('attendance.approvals.filterOffline')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(names().map((n) => n.includes('Karim') || n.includes('Noor'))).toEqual([true, true])
    expect(filter('attendance.approvals.filterOffline')!.getAttribute('aria-pressed')).toBe('true')

    await act(async () => {
      filter('attendance.approvals.filterAll')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(names()).toHaveLength(3)
  })

  it('shows no filter when nothing was recorded offline', async () => {
    await render([entry('2', 'Lisa', ['LATE_ARRIVAL'])])
    expect(filter('attendance.approvals.filterOffline')).toBeUndefined()
    expect(names()).toHaveLength(1)
  })
})
