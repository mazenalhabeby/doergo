/**
 * Moving a job on the web, when the step asks something.
 *
 * Pinned: a step with no form moves straight through; an own form opens the
 * dialog for ANY mover and the move goes out only with its answers; the legacy
 * report is asked only of the assignee; a refusal lands on its field and keeps
 * the dialog open; a move the page thought asked nothing, refused for want of
 * answers, reads the job's own workflow and asks. And the report view renders
 * a submission from its SNAPSHOT.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { STEP_FORM_REFUSAL } from '@hbcfield/shared/client'

const auth = { user: { id: 'u-office' } as { id: string } | null }

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({
    t: (key: string, opts?: unknown) => {
      const o = (typeof opts === 'string' ? { defaultValue: opts } : opts) as { defaultValue?: string } | undefined
      return o?.defaultValue !== undefined && key.startsWith('stepForm.presetField') ? o.defaultValue : key
    },
    i18n: { language: 'en' },
  }),
}))
jest.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: auth.user }) }))
jest.mock('@/lib/api', () => ({
  tasksApi: { getById: jest.fn() },
  taskAttachmentsApi: {},
  uploadToS3: jest.fn(),
}))
jest.mock('@/components/common/signature-pad', () => ({ SignaturePad: () => null }))

// eslint-disable-next-line import/first
import { useStepMove, type StepMoveRequest, type StepMoveResult } from '../use-step-move'
// eslint-disable-next-line import/first
import { StepReport } from '../step-reports-section'
// eslint-disable-next-line import/first
import { tasksApi } from '@/lib/api'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement
let move: ((r: StepMoveRequest) => Promise<StepMoveResult>) | null = null

function Harness() {
  const m = useStepMove()
  move = m.move
  return <>{m.dialog}</>
}

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<Harness />))
  ;(tasksApi.getById as jest.Mock).mockReset()
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  document.body.innerHTML = ''
})

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

const outcomeForm = {
  version: 1,
  fields: [
    { id: 'why', type: 'choice', label: 'Why', required: true, options: ['Nobody home', 'Refused'] },
    { id: 'note', type: 'note', label: 'Notes', required: false },
  ],
}
const workflow = {
  name: 'Deliveries',
  statuses: [
    { key: 'FAILED', name: "Couldn't deliver", isFinal: false, capabilities: [], form: outcomeForm },
    { key: 'ON_WAY', name: 'On the way', isFinal: false, capabilities: [], form: null },
    { key: 'COMPLETED', name: 'Done', isFinal: true, capabilities: ['report'], form: null },
  ],
}
const task = { id: 't1', assignedToId: 'u-driver', assignees: [] }

const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(text))

describe('useStepMove', () => {
  it('a step that asks nothing moves straight through, without answers', async () => {
    const send = jest.fn(async () => ({}))
    let result: StepMoveResult | undefined
    await act(async () => { result = await move!({ task, status: 'ON_WAY', workflow, send }) })
    expect(send).toHaveBeenCalledWith(undefined)
    expect(result).toBe('moved')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it("an office move of somebody else's job to a legacy report step is not asked", async () => {
    const send = jest.fn(async () => ({}))
    await act(async () => { await move!({ task, status: 'COMPLETED', workflow, send }) })
    expect(send).toHaveBeenCalledWith(undefined)
  })

  it('the assignee completing a legacy report step is asked the standard report', async () => {
    auth.user = { id: 'u-driver' }
    act(() => root.render(<Harness />))
    const send = jest.fn(async () => ({}))
    act(() => { void move!({ task, status: 'COMPLETED', workflow, send }) })
    await flush()
    expect(send).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('stepForm.dialog.legacyCaption')
    // The six fixed-id fields, labelled through the translation of the preset.
    expect(document.body.textContent).toContain('What you did')
    expect(document.body.textContent).toContain('Customer signature')
    auth.user = { id: 'u-office' }
  })

  it("an own form opens for ANY mover, refuses to send until required answers are given, then sends them", async () => {
    const send = jest.fn(async () => ({}))
    let result: StepMoveResult | undefined
    act(() => { void move!({ task, status: 'FAILED', workflow, send }).then((r) => { result = r }) })
    await flush()
    expect(document.body.textContent).toContain('Why')

    // Submitting empty: the required choice is flagged, nothing is sent.
    await act(async () => { button('stepForm.dialog.submit')!.click() })
    expect(send).not.toHaveBeenCalled()
    expect(document.querySelector('[data-testid="step-error-why"]')?.textContent).toContain('stepForm.answerError.required')

    await act(async () => { button('Refused')!.click() })
    await act(async () => { button('stepForm.dialog.submit')!.click() })
    await flush()
    expect(send).toHaveBeenCalledWith({ why: 'Refused' })
    expect(result).toBe('moved')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('a refusal lands on its field and the dialog stays open', async () => {
    const refusal = Object.assign(new Error('bad'), {
      code: STEP_FORM_REFUSAL.INVALID,
      params: { statusKey: 'FAILED', errors: [{ fieldId: 'note', code: 'too_long' }] },
    })
    const send = jest.fn(async (a?: unknown) => { if (a) throw refusal })
    act(() => { void move!({ task, status: 'FAILED', workflow, send }) })
    await flush()
    await act(async () => { button('Nobody home')!.click() })
    await act(async () => { button('stepForm.dialog.submit')!.click() })
    await flush()
    expect(send).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-testid="step-error-note"]')?.textContent).toContain('stepForm.answerError.too_long')
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('closing the dialog resolves "cancelled" and sends nothing', async () => {
    const send = jest.fn(async () => ({}))
    let result: StepMoveResult | undefined
    act(() => { void move!({ task, status: 'FAILED', workflow, send }).then((r) => { result = r }) })
    await flush()
    await act(async () => { button('common.cancel')!.click() })
    await flush()
    expect(result).toBe('cancelled')
    expect(send).not.toHaveBeenCalled()
  })

  it("a move refused for want of answers reads the job's own workflow and asks", async () => {
    ;(tasksApi.getById as jest.Mock).mockResolvedValue({ id: 't1', workflow })
    const refusal = Object.assign(new Error('answers'), { code: STEP_FORM_REFUSAL.INVALID, params: { errors: [] } })
    const send = jest.fn(async (a?: unknown) => { if (a === undefined) throw refusal })
    // The page believed the job ran a flow where FAILED asks nothing.
    const stale = { name: 'Deliveries', statuses: [{ key: 'FAILED', name: 'Failed', form: null }] }
    act(() => { void move!({ task, status: 'FAILED', workflow: stale, send }) })
    await flush()
    expect(tasksApi.getById).toHaveBeenCalledWith('t1')
    expect(document.body.textContent).toContain('Why')
  })
})

describe('StepReport', () => {
  it('renders a submission from its snapshot, not today\'s definition', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const r = createRoot(el)
    act(() =>
      r.render(
        <StepReport
          workflowStatuses={[{ key: 'DELIVERED', name: 'Delivered' }]}
          submission={{
            id: 's1',
            statusKey: 'DELIVERED',
            formVersion: 2,
            form: {
              version: 2,
              fields: [
                { id: 'proof', type: 'photos', label: 'Proof of delivery', required: true },
                { id: 'by', type: 'name', label: 'Received by', required: true },
                { id: 'damaged', type: 'yesno', label: 'Anything damaged?', required: false },
                { id: 'sig', type: 'signature', label: 'Recipient signature', required: false },
                { id: 'meter', type: 'number', label: 'Meter', required: false },
              ],
            },
            answers: { proof: ['a1'], by: 'Maria', damaged: false, sig: 'a2' },
            files: {
              a1: { id: 'a1', fileName: 'door.jpg', url: 'https://signed/a1' },
              a2: { id: 'a2', fileName: 'sig.png', url: 'https://signed/a2' },
            },
            submittedAt: '2026-09-27T10:00:00.000Z',
            submittedBy: { id: 'u1', firstName: 'Mike', lastName: 'Weber' },
          }}
        />,
      ),
    )
    const text = el.textContent ?? ''
    expect(text).toContain('Delivered')
    expect(text).toContain('Proof of delivery')
    expect(text).toContain('Maria')
    expect(text).toContain('stepForm.dialog.no')
    expect(text).toContain('stepForm.report.notAnswered') // the meter, unanswered
    const imgs = [...el.querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(imgs).toEqual(['https://signed/a1', 'https://signed/a2'])
    act(() => r.unmount())
  })
})
