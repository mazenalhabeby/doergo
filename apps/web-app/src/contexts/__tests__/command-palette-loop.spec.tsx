/**
 * "Maximum update depth exceeded" on /tasks.
 *
 * The page registers its palette actions in an effect whose deps included the
 * workspace list — a fresh `[]` every render while that list loaded. Cleanup
 * (unregister) then effect (register) each set the provider's state, the second
 * producing a NEW array with the same ids, so the page re-rendered, got another
 * fresh `[]`, and ran the effect again. Coalesced, the same ids are a no-op.
 */
import React, { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CommandPaletteProvider, useCommandPalette } from '../command-palette-context'

let container: HTMLDivElement
let root: Root
let renders = 0

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  renders = 0
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function Page() {
  renders++
  const { registerActions, unregisterActions, actions } = useCommandPalette()
  const spaces: { id: string }[] = [] // unstable on purpose, like a list still loading
  useEffect(() => {
    const list = [{ id: 'task-create', label: 'Create', group: 'tasks', onSelect: () => {} }, ...spaces.map((s) => ({ id: s.id, label: s.id, group: 'tasks', onSelect: () => {} }))]
    registerActions(list as never)
    return () => unregisterActions(list.map((a) => a.id))
  }, [spaces, registerActions, unregisterActions])
  return <span data-n={actions.length} />
}

it('re-registering the same actions does not re-render the page forever', async () => {
  await act(async () => {
    root.render(<CommandPaletteProvider><Page /></CommandPaletteProvider>)
  })
  await act(async () => { await Promise.resolve() })
  expect(container.querySelector('span')!.getAttribute('data-n')).toBe('1')
  expect(renders).toBeLessThan(10)
})
