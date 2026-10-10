/**
 * The one confirm dialog. Pinned: the markup each call site used to write by
 * hand — the default Cancel label, a hidden Cancel, the red Action, and what
 * `pending` disables — so adopting it changes nothing on screen.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { ConfirmDialog, ConfirmTargetDialog, type ConfirmDialogProps } from '../confirm-dialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  document.body.innerHTML = ''
})

function show(props: Partial<ConfirmDialogProps> = {}) {
  act(() =>
    root.render(
      <ConfirmDialog open title="Delete it?" description="Gone for good." confirmLabel="Delete" {...props} />,
    ),
  )
  const dialog = document.querySelector('[role="alertdialog"]') as HTMLElement
  const buttons = Array.from(dialog.querySelectorAll('button'))
  return { dialog, buttons, cancel: buttons.find((b) => b.textContent === 'common.cancel'), action: buttons[buttons.length - 1] }
}

it('renders the title, the description and the default Cancel', () => {
  const { dialog, cancel, action } = show()
  expect(dialog.textContent).toContain('Delete it?')
  expect(dialog.textContent).toContain('Gone for good.')
  expect(cancel).toBeDefined()
  expect(action.textContent).toBe('Delete')
  expect(action.className).not.toContain('bg-red-600')
})

it('a null cancel label leaves the Cancel button out', () => {
  const { buttons } = show({ cancelLabel: null })
  expect(buttons).toHaveLength(1)
})

it('destructive paints the Action red and keeps the caller classes', () => {
  const { action, cancel } = show({ destructive: true, confirmClassName: 'rounded-lg', cancelClassName: 'rounded-lg' })
  expect(action.className).toContain('bg-red-600')
  expect(action.className).toContain('hover:bg-red-700')
  expect(action.className).toContain('rounded-lg')
  expect(cancel!.className).toContain('rounded-lg')
})

it('pending disables both buttons and shows a spinner', () => {
  const { action, cancel } = show({ pending: true })
  expect(action.disabled).toBe(true)
  expect(cancel!.disabled).toBe(true)
  expect(action.querySelector('svg.animate-spin')).not.toBeNull()
})

it('confirmDisabled disables only the Action, with no spinner', () => {
  const { action, cancel } = show({ confirmDisabled: true })
  expect(action.disabled).toBe(true)
  expect(cancel!.disabled).toBe(false)
  expect(action.querySelector('svg')).toBeNull()
})

it('the Action calls onConfirm', () => {
  const onConfirm = jest.fn()
  const { action } = show({ onConfirm })
  act(() => action.click())
  expect(onConfirm).toHaveBeenCalledTimes(1)
})

it('extra content sits between the text and the buttons', () => {
  const { dialog } = show({ children: <p data-testid="extra">note</p> })
  const extra = dialog.querySelector('[data-testid="extra"]')!
  const footerButton = dialog.querySelector('button')!
  expect(extra.compareDocumentPosition(footerButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

describe('ConfirmTargetDialog', () => {
  function showTarget(target: { id: string } | null, isPending = false) {
    const mutation = { mutate: jest.fn(), isPending }
    const onClose = jest.fn()
    act(() =>
      root.render(
        <ConfirmTargetDialog target={target} onClose={onClose} mutation={mutation} title="Delete?" description="Sure?" confirmLabel="Delete" />,
      ),
    )
    const dialog = document.querySelector('[role="alertdialog"]') as HTMLElement | null
    return { dialog, mutation, onClose }
  }

  it('is closed while nothing is picked', () => {
    expect(showTarget(null).dialog).toBeNull()
  })

  it('runs the mutation on the picked id, stays open, and is red', () => {
    const { dialog, mutation } = showTarget({ id: 'row-1' })
    const action = Array.from(dialog!.querySelectorAll('button')).pop()!
    expect(action.className).toContain('bg-red-600')
    act(() => action.click())
    expect(mutation.mutate).toHaveBeenCalledWith('row-1')
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull()
  })

  it('Cancel clears the target; a running mutation disables both buttons', () => {
    const { dialog, onClose } = showTarget({ id: 'row-1' })
    const cancel = Array.from(dialog!.querySelectorAll('button')).find((b) => b.textContent === 'common.cancel')!
    act(() => cancel.click())
    expect(onClose).toHaveBeenCalled()

    const busy = showTarget({ id: 'row-1' }, true)
    const buttons = Array.from(busy.dialog!.querySelectorAll('button'))
    expect(buttons.every((b) => b.disabled)).toBe(true)
  })
})
