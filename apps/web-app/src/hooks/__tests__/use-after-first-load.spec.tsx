/**
 * The shell's background reads (bell, chat, support, documents, billing ribbon,
 * clock-in sites) wait until the page's own first load is over, then go out in
 * waves — so opening a page is not 20 requests in the same instant.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useAfterFirstLoad } from '../use-after-first-load'
import { DEFERRED_MIN_DELAY_MS, DEFERRED_WAVE_GAP_MS, DEFERRED_MAX_DELAY_MS } from '@/lib/deferred-start'

let container: HTMLDivElement
let root: Root
let qc: QueryClient

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  jest.useFakeTimers()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  qc.clear()
  jest.useRealTimers()
})

const seen: Record<string, boolean[]> = {}
function Probe({ name, wave }: { name: string; wave?: 0 | 1 | 2 }) {
  const ready = useAfterFirstLoad(wave)
  ;(seen[name] ??= []).push(ready)
  return null
}

/** A page query that takes `ms` to answer. */
function Page({ ms }: { ms: number }) {
  useQuery({ queryKey: ['page'], queryFn: () => new Promise((r) => setTimeout(() => r(1), ms)) })
  return null
}

const last = (name: string) => seen[name]?.[seen[name].length - 1]

function render(ui: React.ReactNode) {
  act(() => root.render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>))
}

it('holds every wave until the page has loaded, then releases them a gap apart', async () => {
  for (const k of Object.keys(seen)) delete seen[k]
  render(
    <>
      <Page ms={DEFERRED_MIN_DELAY_MS + 500} />
      <Probe name="w0" />
      <Probe name="w1" wave={1} />
      <Probe name="w2" wave={2} />
    </>,
  )
  expect(last('w0')).toBe(false)

  // Past the minimum, but the page is still loading.
  await act(async () => { jest.advanceTimersByTime(DEFERRED_MIN_DELAY_MS + 100) })
  expect(last('w0')).toBe(false)

  // The page answers; the gate opens on the next idle tick.
  await act(async () => { jest.advanceTimersByTime(400) })
  await act(async () => { jest.advanceTimersByTime(50) })
  expect(last('w0')).toBe(true)
  expect(last('w1')).toBe(false)
  expect(last('w2')).toBe(false)

  await act(async () => { jest.advanceTimersByTime(DEFERRED_WAVE_GAP_MS) })
  expect(last('w1')).toBe(true)
  expect(last('w2')).toBe(false)

  await act(async () => { jest.advanceTimersByTime(DEFERRED_WAVE_GAP_MS) })
  expect(last('w2')).toBe(true)
})

it('opens at the ceiling even when the page never settles', async () => {
  for (const k of Object.keys(seen)) delete seen[k]
  render(
    <>
      <Page ms={60_000} />
      <Probe name="w0" />
    </>,
  )
  await act(async () => { jest.advanceTimersByTime(DEFERRED_MAX_DELAY_MS - 1) })
  expect(last('w0')).toBe(false)
  await act(async () => { jest.advanceTimersByTime(1) })
  expect(last('w0')).toBe(true)
})

it('stays open for anything mounted later (a client-side navigation never waits again)', async () => {
  for (const k of Object.keys(seen)) delete seen[k]
  render(<Probe name="first" wave={2} />)
  await act(async () => { jest.advanceTimersByTime(DEFERRED_MAX_DELAY_MS + 2 * DEFERRED_WAVE_GAP_MS) })
  expect(last('first')).toBe(true)
  render(
    <>
      <Probe name="first" wave={2} />
      <Probe name="later" wave={2} />
    </>,
  )
  expect(seen.later[0]).toBe(true)
})
