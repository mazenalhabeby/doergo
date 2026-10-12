/**
 * The member panel's "What they can do here": what it SENDS.
 *
 * The body of `PUT /spaces/:id/members/:assignmentId/permissions` must be
 * exactly `permissionsFromChoice(choice)` — the shared model, never a list the
 * screen built itself — and a shared role goes as `{ roleId }`.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('next/dynamic', () => () => {
  // Render the builder synchronously in the test.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/components/permissions/permission-builder').PermissionBuilder
})
jest.mock('@/lib/toast', () => ({ notify: { success: jest.fn(), error: jest.fn() } }))
jest.mock('@/hooks/use-space-modules', () => ({
  useSpaceModules: () => ({ enabledModules: ['time_tracking', 'crm', 'assets', 'b2c_portal'], isResolved: true, hasModule: () => true }),
}))
jest.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { id: 'me', role: 'ADMIN' } }) }))

const getPermissions = jest.fn()
const setPermissions = jest.fn()
jest.mock('@/lib/api', () => ({
  spaceMembersApi: {
    getPermissions: (...a: unknown[]) => getPermissions(...a),
    setPermissions: (...a: unknown[]) => setPermissions(...a),
  },
  organizationsApi: { getMember: jest.fn(), updateMember: jest.fn() },
}))

import { choiceFromPermissions, permissionsFromChoice, type SpaceMember } from '@hbcfield/shared/client'
import { presetChoice } from '@/lib/permission-builder'
import { MemberPermissions } from '../member-permissions'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const observerPerms = { canViewAllTasks: true, canCreateTasks: true }
const view = {
  assignmentId: 'a1', spaceId: 's1', userId: 'u1', roleId: 'r-obs', roleName: 'External Observer', personal: false,
  preset: 'observer', permissions: observerPerms, choice: choiceFromPermissions(observerPerms),
  isExternal: true, observerSeat: true, platforms: 'both',
  assignableRoles: [{ id: 'r-sup', name: 'External Supervisor', color: null, isSystem: true, permissions: {} }],
}

let root: Root
let host: HTMLDivElement
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  getPermissions.mockResolvedValue(view)
  setPermissions.mockImplementation(async () => view)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  jest.clearAllMocks()
})

const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve() }) }

async function render() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const member = { id: 'a1', userId: 'u1', user: { firstName: 'Anna', lastName: 'B', isExternal: true } } as unknown as SpaceMember
  act(() => root.render(
    <QueryClientProvider client={qc}>
      <MemberPermissions spaceId="s1" member={member} section="" heading="" collapsible={false} />
    </QueryClientProvider>,
  ))
  await flush()
}

const button = (text: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement

it('loads the person and saves exactly permissionsFromChoice of what was chosen', async () => {
  await render()
  expect(getPermissions).toHaveBeenCalledWith('s1', 'a1')
  // Nothing changed yet — nothing to save.
  expect(button('permissionBuilder.panel.save').disabled).toBe(true)

  await act(async () => { button('permissionBuilder.presets.supervisor.title').click() })
  const save = button('permissionBuilder.panel.save')
  expect(save.disabled).toBe(false)
  await act(async () => { save.click() })
  await flush()

  expect(setPermissions).toHaveBeenCalledTimes(1)
  const [spaceId, assignmentId, body] = setPermissions.mock.calls[0]
  expect([spaceId, assignmentId]).toEqual(['s1', 'a1'])
  expect(body).toEqual({ permissions: permissionsFromChoice(presetChoice('supervisor', { isExternal: true })) })
})
