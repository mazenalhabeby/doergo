/**
 * The one debounce. A search box types "boiler" → ONE settled value (one
 * request), not six; an autosave fires once after the edits stop and never
 * after the screen is gone.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useDebouncedCallback, useDebouncedValue } from '../use-debounced-value'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  jest.useFakeTimers()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  jest.useRealTimers()
})

describe('useDebouncedValue', () => {
  const seen: string[] = []
  function Probe({ value, delay }: { value: string; delay?: number }) {
    const settled = useDebouncedValue(value, delay)
    seen.push(settled)
    return <span>{settled}</span>
  }

  beforeEach(() => {
    seen.length = 0
  })

  it('starts on the initial value, with no wait', () => {
    act(() => root.render(<Probe value="a" />))
    expect(container.textContent).toBe('a')
  })

  it('settles once, on the LAST value, after typing stops for the delay', () => {
    act(() => root.render(<Probe value="" />))
    for (const v of ['b', 'bo', 'boi', 'boil', 'boile', 'boiler']) {
      act(() => root.render(<Probe value={v} />))
      act(() => jest.advanceTimersByTime(100))
    }
    // 100ms after the last keystroke: still the old value.
    expect(container.textContent).toBe('')
    act(() => jest.advanceTimersByTime(200))
    expect(container.textContent).toBe('boiler')
    // No intermediate term ever reached the consumer.
    expect(new Set(seen.filter(Boolean))).toEqual(new Set(['boiler']))
  })

  it('defaults to 300ms', () => {
    act(() => root.render(<Probe value="x" />))
    act(() => root.render(<Probe value="y" />))
    act(() => jest.advanceTimersByTime(299))
    expect(container.textContent).toBe('x')
    act(() => jest.advanceTimersByTime(1))
    expect(container.textContent).toBe('y')
  })

  it('honours a custom delay', () => {
    act(() => root.render(<Probe value="x" delay={50} />))
    act(() => root.render(<Probe value="y" delay={50} />))
    act(() => jest.advanceTimersByTime(50))
    expect(container.textContent).toBe('y')
  })
})

describe('useDebouncedCallback', () => {
  let trigger: () => void = () => undefined
  function Probe({ fn, delay }: { fn: () => void; delay?: number }) {
    trigger = useDebouncedCallback(fn, delay)
    return null
  }

  it('runs once after the calls stop', () => {
    const fn = jest.fn()
    act(() => root.render(<Probe fn={fn} delay={800} />))
    trigger()
    act(() => jest.advanceTimersByTime(500))
    trigger()
    act(() => jest.advanceTimersByTime(500))
    expect(fn).not.toHaveBeenCalled()
    act(() => jest.advanceTimersByTime(300))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('drops a pending call on unmount', () => {
    const fn = jest.fn()
    act(() => root.render(<Probe fn={fn} />))
    trigger()
    act(() => root.unmount())
    jest.advanceTimersByTime(1000)
    expect(fn).not.toHaveBeenCalled()
    // afterEach unmounts again; give it a fresh root so that is harmless.
    root = createRoot(container)
  })
})
