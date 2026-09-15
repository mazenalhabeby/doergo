/**
 * The asset record, completed: its status, its plate, a handover dated when it
 * happened, the reports under its jobs, and a refusal that says why.
 *
 * Each of these existed on the server with nothing on screen reaching it. What
 * is pinned here is the part the SCREEN decides — what it sends, and what it
 * refuses before sending — because a form that sends "" where the server wants
 * null, or "now" where somebody chose Friday, fails silently and looks fine.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { planHandover } from '@hbcfield/shared/client'

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      const values = (typeof fallback === 'object' ? fallback : vars) ?? {}
      return text.replace(/\{\{(\w+)\}\}/g, (_, k) => String(values[k] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
jest.mock('@/lib/toast', () => ({ notify: { success: jest.fn(), error: jest.fn() } }))

// eslint-disable-next-line import/first
import { factsPayload } from '@/components/assets/asset-record-dialog'
// eslint-disable-next-line import/first
import { handoverAt, toLocalInput } from '@/components/assets/asset-handover-dialog'
// eslint-disable-next-line import/first
import { workDurationLabel } from '@/components/assets/asset-service-reports'
// eslint-disable-next-line import/first
import { AssetStatusChip, AssetStatusPicker } from '@/components/assets/asset-status'
// eslint-disable-next-line import/first
import { ExpenseRefuseDialog } from '@/components/assets/expense-refuse-dialog'

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

const blank = { serialNumber: '', manufacturer: '', model: '', installDate: '', warrantyExpiry: '', notes: '' }

describe('what a save sends for the plate', () => {
  it('sends an emptied box as null on an edit, so the fact is cleared', () => {
    expect(factsPayload({ ...blank, serialNumber: '  ', model: 'Transit' }, true)).toEqual({
      serialNumber: null, manufacturer: null, model: 'Transit', installDate: null, warrantyExpiry: null, notes: null,
    })
  })

  it('sends nothing for an empty box on a new record', () => {
    expect(factsPayload({ ...blank, warrantyExpiry: '2027-03-15' }, false)).toEqual({ warrantyExpiry: '2027-03-15' })
  })
})

describe('a handover dated when it happened', () => {
  it('sends no time when nobody chose one — the server’s clock is the better now', () => {
    expect(handoverAt(toLocalInput(new Date()), false)).toBeUndefined()
    expect(handoverAt('', true)).toBeUndefined()
  })

  it('sends a chosen time as an instant', () => {
    const friday = new Date(2026, 8, 11, 17, 30)
    expect(handoverAt(toLocalInput(friday), true)).toBe(friday.toISOString())
  })

  /*
    The date goes into the SAME plan the server executes, so the two problems
    the dialog renders beside the box are exactly the two it would be refused on.
  */
  it('feeds the shared plan, which refuses the future and a time before the holder got it', () => {
    const now = new Date(2026, 8, 15, 12, 0)
    const periods = [{ id: 'p1', userId: 'ahmed', startedAt: new Date(2026, 8, 1, 8, 0), endedAt: null }]

    const ahead = planHandover({ periods, to: [{ userId: 'mira' }], at: handoverAt(toLocalInput(new Date(2026, 8, 16, 9, 0)), true), now })
    expect(ahead.problems.map((p) => p.kind)).toContain('future')

    const tooEarly = planHandover({ periods, to: [{ userId: 'mira' }], at: handoverAt(toLocalInput(new Date(2026, 7, 20, 9, 0)), true), now })
    expect(tooEarly.problems.map((p) => p.kind)).toContain('before-start')

    const friday = planHandover({ periods, to: [{ userId: 'mira' }], at: handoverAt(toLocalInput(new Date(2026, 8, 11, 17, 30)), true), now })
    expect(friday.problems).toEqual([])
  })
})

describe('work on a report, as a person reads it', () => {
  it('reads seconds as hours and minutes, and says nothing for none', () => {
    expect(workDurationLabel(5400)).toBe('1h 30m')
    expect(workDurationLabel(3600)).toBe('1h')
    expect(workDurationLabel(900)).toBe('15m')
    expect(workDurationLabel(0)).toBeNull()
    expect(workDurationLabel(null)).toBeNull()
  })
})

describe('status on screen', () => {
  it('labels a chip, and treats an unknown value as active rather than blank', async () => {
    await act(async () => {
      root.render(<><AssetStatusChip status="MAINTENANCE" /><AssetStatusChip status="nonsense" /></>)
    })
    expect(container.textContent).toContain('In maintenance')
    expect(container.textContent).toContain('Active')
  })

  it('says what retiring does the moment Retired is chosen', async () => {
    const onChange = jest.fn()
    await act(async () => { root.render(<AssetStatusPicker value="ACTIVE" onChange={onChange} />) })
    expect(container.textContent).not.toContain('stops it counting on the bill')

    const retired = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Retired')!
    await act(async () => { retired.click() })
    expect(onChange).toHaveBeenCalledWith('RETIRED')

    await act(async () => { root.render(<AssetStatusPicker value="RETIRED" onChange={onChange} />) })
    expect(container.textContent).toContain('stops it counting on the bill')
  })
})

describe('refusing an expense asks why', () => {
  it('sends the reason the member will read', async () => {
    const onRefuse = jest.fn()
    await act(async () => {
      root.render(<ExpenseRefuseDialog onRefuse={onRefuse} trigger={<button>refuse</button>} />)
    })
    await act(async () => { container.querySelector('button')!.click() })

    const box = document.body.querySelector('textarea') as HTMLTextAreaElement
    expect(box).toBeTruthy()
    // React tracks the value through its own setter, so set it the way a keystroke would.
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(box, '  Not a fuel receipt  ')
      box.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const confirm = [...document.body.querySelectorAll('button')].find((b) => b.textContent === 'Refuse')!
    await act(async () => { confirm.click() })
    expect(onRefuse).toHaveBeenCalledWith('Not a fuel receipt')
  })

  it('still refuses with no reason — sometimes "duplicate" is all there is', async () => {
    const onRefuse = jest.fn()
    await act(async () => {
      root.render(<ExpenseRefuseDialog onRefuse={onRefuse} trigger={<button>refuse</button>} />)
    })
    await act(async () => { container.querySelector('button')!.click() })
    const confirm = [...document.body.querySelectorAll('button')].find((b) => b.textContent === 'Refuse')!
    await act(async () => { confirm.click() })
    expect(onRefuse).toHaveBeenCalledWith(undefined)
  })
})
