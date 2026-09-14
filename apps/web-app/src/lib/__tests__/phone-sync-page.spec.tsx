/**
 * The Phone sync page, rendered.
 *
 * phone-sync.spec.ts covers the rules; this covers what a manager sees: who may
 * open it, the empty states, the summary that doubles as a filter, search, the
 * panel for one phone, and a failed load. The API, the signed-in user and the
 * translations are stubbed; everything else is the real page.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { SyncMemberHealth } from '@hbcfield/shared/client'

// ── stubs ────────────────────────────────────────────────────────────────────

const mockUser: { current: Record<string, unknown> | null } = { current: null }
jest.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: mockUser.current }) }))

const mockHealth = jest.fn<Promise<SyncMemberHealth[]>, []>()
const mockMembers = jest.fn()
jest.mock('@/lib/api', () => ({
  syncApi: { memberHealth: () => mockHealth() },
  organizationsApi: { getMembers: (params: unknown) => mockMembers(params) },
}))

/** The key, with any values after it — enough to assert on without a catalogue. */
jest.mock('react-i18next', () => ({
  // The app's i18n module registers itself on import (through format-date).
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}(${Object.entries(values).map(([k, v]) => `${k}=${v}`).join(',')})` : key,
  }),
}))

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

// eslint-disable-next-line import/first
import PhoneSyncPage from '../../app/(dashboard)/members/phone-sync/page'

// ── fixtures ─────────────────────────────────────────────────────────────────

const NOW = Date.parse('2026-09-15T11:30:00.000Z')
const HOUR = 3_600_000

const report = (over: Partial<SyncMemberHealth>): SyncMemberHealth => ({
  userId: 'u', state: 'up_to_date', appVersion: '1.0.6', waiting: 0, attention: 0, oldestWaitingAt: null,
  byState: {}, codes: {}, filesWaiting: 0, bytesWaiting: 0, lastSuccessAt: NOW - HOUR, receivedAt: NOW - 4 * 60_000,
  ...over,
})

const KARIM = report({
  userId: 'karim', state: 'stuck', waiting: 23, oldestWaitingAt: NOW - 31 * HOUR, lastSuccessAt: NOW - 31 * HOUR,
  byState: { pending: 20, inflight: 2, retry: 1 }, codes: { WAITING_FOR_WIFI: 11, NETWORK: 12 },
  filesWaiting: 11, bytesWaiting: 38 * 1024 * 1024,
})
const SARAH = report({ userId: 'sarah', state: 'needs_member', waiting: 1, attention: 1, oldestWaitingAt: NOW - 2 * HOUR, codes: { TASK_REASSIGNED: 1 } })
const LISA = report({ userId: 'lisa' })

const people = [
  { id: 'karim', firstName: 'Karim', lastName: 'Ahmad', email: 'karim@example.com', position: 'HVAC Specialist' },
  { id: 'sarah', firstName: 'Sarah', lastName: 'Wagner', email: 'sarah@example.com', position: null },
  { id: 'lisa', firstName: 'Lisa', lastName: 'Adler', email: 'lisa@example.com', position: 'Electrician' },
]

// ── harness ──────────────────────────────────────────────────────────────────

let container: HTMLDivElement
let root: Root

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  // The clock only: React Query schedules its updates on real timers.
  jest.spyOn(Date, 'now').mockReturnValue(NOW)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  mockUser.current = { id: 'admin', canManageUsers: true, offlineMode: true }
  mockHealth.mockReset()
  mockMembers.mockReset().mockResolvedValue({ data: people, meta: { page: 1, limit: 200, total: 3, totalPages: 1 } })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  jest.restoreAllMocks()
})

/** Render and let the queries settle. */
async function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <PhoneSyncPage />
      </QueryClientProvider>,
    )
  })
  await settle()
}

/** Let promises and React Query's scheduled updates run. */
async function settle() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

const text = () => container.textContent ?? ''
const rows = () => Array.from(container.querySelectorAll('tbody tr'))
const rowNames = () => rows().map((r) => r.querySelector('td')?.textContent ?? '')
const chip = (label: string) =>
  Array.from(container.querySelectorAll('button[aria-pressed]')).find((b) => b.textContent?.includes(label)) as HTMLButtonElement
const panel = () => container.querySelector('section') as HTMLElement | null

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('Phone sync page', () => {
  it('is closed to anybody who cannot manage users, and asks the server nothing', async () => {
    mockUser.current = { id: 'm', canManageUsers: false, offlineMode: true }
    await render()
    expect(text()).toContain('manage.noAccess')
    expect(mockHealth).not.toHaveBeenCalled()
  })

  it('says offline work is off when no phone reported and the organization has not switched it on', async () => {
    mockUser.current = { id: 'admin', canManageUsers: true, offlineMode: false }
    mockHealth.mockResolvedValue([])
    await render()
    expect(text()).toContain('members.phoneSync.empty.title')
    expect(text()).toContain('members.phoneSync.empty.bodyOff')
    expect(mockMembers).not.toHaveBeenCalled()
  })

  it('says phones appear within minutes when offline work is on but none reported yet', async () => {
    mockHealth.mockResolvedValue([])
    await render()
    expect(text()).toContain('members.phoneSync.empty.bodyOn')
  })

  it('lists each phone with its member, state, what waits and for how long', async () => {
    mockHealth.mockResolvedValue([KARIM, SARAH, LISA])
    await render()

    expect(rowNames()).toEqual([
      expect.stringContaining('Karim Ahmad'),
      expect.stringContaining('Sarah Wagner'),
      expect.stringContaining('Lisa Adler'),
    ])
    const karim = rows()[0]!.textContent!
    expect(karim).toContain('members.phoneSync.states.stuck')
    expect(karim).toContain('23')
    expect(karim).toContain('31')
    expect(karim).toContain('38 MB')
    expect(karim).toContain('1.0.6')
    // Names are asked for the ids in the report, not the whole organization.
    expect(mockMembers).toHaveBeenCalledWith(expect.objectContaining({ lite: true, includeIds: ['karim', 'sarah', 'lisa'] }))
  })

  it('summarises by state, and each summary chip filters the list', async () => {
    mockHealth.mockResolvedValue([KARIM, SARAH, LISA])
    await render()

    expect(chip('members.phoneSync.allPhones').textContent).toContain('3')
    expect(chip('members.phoneSync.states.stuck').textContent).toContain('1')
    // A state no phone is in has no chip.
    expect(chip('members.phoneSync.states.silent')).toBeUndefined()

    await click(chip('members.phoneSync.states.needs_member'))
    expect(rowNames()).toEqual([expect.stringContaining('Sarah Wagner')])
    expect(chip('members.phoneSync.states.needs_member').getAttribute('aria-pressed')).toBe('true')

    await click(chip('members.phoneSync.allPhones'))
    expect(rows()).toHaveLength(3)
  })

  it('searches by name or email', async () => {
    mockHealth.mockResolvedValue([KARIM, SARAH, LISA])
    await render()
    const search = container.querySelector('input') as HTMLInputElement

    await type(search, 'adler')
    expect(rowNames()).toEqual([expect.stringContaining('Lisa Adler')])

    await type(search, 'nobody')
    expect(text()).toContain('members.phoneSync.noMatch')
  })

  it('opens on the most urgent phone and explains it: what waits, why in words, what helps', async () => {
    mockHealth.mockResolvedValue([KARIM, SARAH, LISA])
    await render()

    const p = panel()!
    expect(p.textContent).toContain('Karim Ahmad')
    expect(p.textContent).toContain('members.phoneSync.detail.stuckFor(count=23')
    // Reasons as words, most frequent first.
    const reasons = Array.from(p.querySelectorAll('li')).map((li) => li.textContent)
    expect(reasons).toEqual([
      expect.stringContaining('members.phoneSync.reasons.NETWORK'),
      expect.stringContaining('members.phoneSync.reasons.WAITING_FOR_WIFI'),
    ])
    expect(p.textContent).toContain('members.phoneSync.advice.stuck(name=Karim)')
  })

  it('shows another phone when its row is chosen', async () => {
    mockHealth.mockResolvedValue([KARIM, SARAH, LISA])
    await render()

    await click(rows()[1]!)
    expect(panel()!.textContent).toContain('Sarah Wagner')
    expect(panel()!.textContent).toContain('members.phoneSync.reasons.TASK_REASSIGNED')
    expect(panel()!.textContent).toContain('members.phoneSync.advice.needs_member(name=Sarah)')
    expect(rows()[1]!.getAttribute('aria-selected')).toBe('true')
  })

  it('never shows a raw code: one the page does not know still reads as a sentence', async () => {
    mockHealth.mockResolvedValue([report({ userId: 'karim', state: 'sending', waiting: 2, oldestWaitingAt: NOW - HOUR, codes: { SOMETHING_NEW: 2 } })])
    await render()
    expect(panel()!.textContent).toContain('members.phoneSync.reasons.OTHER(code=SOMETHING_NEW)')
  })

  it('names a phone whose member has left rather than showing a blank row', async () => {
    mockHealth.mockResolvedValue([report({ userId: 'gone' })])
    mockMembers.mockResolvedValue({ data: [], meta: {} })
    await render()
    expect(rowNames()[0]).toContain('members.phoneSync.unknownMember')
  })

  it('says when it could not load, and tries again on request', async () => {
    mockHealth.mockRejectedValueOnce(new Error('Service unavailable')).mockResolvedValue([LISA])
    await render()
    expect(text()).toContain('members.phoneSync.loadError')

    const retry = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('common.retry'))!
    await click(retry)
    await settle()
    expect(rowNames()).toEqual([expect.stringContaining('Lisa Adler')])
  })
})
