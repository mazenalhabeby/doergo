/**
 * The permission builder — what one person may do in one workspace.
 *
 * Pinned: presets fill the levels, a level is a segmented choice, a switch is
 * disabled (with its reason) below its area's level, the price line follows
 * the KEYS (the €2 observer seat vs a full seat), an area the workspace does
 * not run is greyed out, and things never offered to externals are absent.
 */
import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts?.price ? `${key}:${opts.price}` : key) }),
}))

import {
  OBSERVER_SEAT_MONTHLY_CENTS,
  SEAT_MONTHLY_CENTS,
  choiceFromPermissions,
  formatCents,
  permissionsFromChoice,
  type PermissionChoice,
} from '@hbcfield/shared/client'
import { PermissionBuilder } from '../permission-builder'
import { builderAreas, builderSwitches, presetChoice, withoutMissingModules } from '@/lib/permission-builder'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement
let last: PermissionChoice

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function Harness({ start, isExternal, spaceModules }: { start: PermissionChoice; isExternal: boolean; spaceModules?: string[] }) {
  const [value, setValue] = useState(start)
  last = value
  return <PermissionBuilder name="Anna" isExternal={isExternal} value={value} onChange={(v) => { last = v; setValue(v) }} spaceModules={spaceModules} />
}

function show(start: PermissionChoice, isExternal = true, spaceModules?: string[]) {
  last = start
  act(() => root.render(<Harness start={start} isExternal={isExternal} spaceModules={spaceModules} />))
}

const presetButton = (id: string) =>
  Array.from(host.querySelectorAll('[role="radio"]')).find((b) => b.textContent?.includes(`permissionBuilder.presets.${id}.title`)) as HTMLButtonElement
const areaRow = (id: string) => host.querySelector(`[data-area="${id}"]`) as HTMLElement
const levelButton = (area: string, level: string) =>
  Array.from(areaRow(area).querySelectorAll('[role="radio"]')).find((b) => b.textContent === `permissionBuilder.areas.${area}.levels.${level}`) as HTMLButtonElement
const switchOf = (id: string) => host.querySelector(`[data-switch="${id}"] button[role="switch"]`) as HTMLButtonElement
const seat = () => host.querySelector('[data-testid="permission-seat"]') as HTMLElement
const click = (el: HTMLElement) => act(() => { el.click() })

const nothing = choiceFromPermissions({})

it('renders the presets, a row per area with its levels, and the switches', () => {
  show(nothing)
  for (const id of ['observer', 'supervisor', 'manager', 'custom']) expect(presetButton(id)).toBeTruthy()
  for (const area of builderAreas(true)) {
    expect(areaRow(area.id)).toBeTruthy()
    for (const level of area.levels) expect(levelButton(area.id, level.id)).toBeTruthy()
  }
  for (const sw of builderSwitches(true)) expect(switchOf(sw.id)).toBeTruthy()
})

it('choosing a preset fills the levels and the switches', () => {
  show(nothing)
  click(presetButton('supervisor'))
  expect(last.levels).toMatchObject({ tasks: 'view', attendance: 'approve' })
  expect(last.switches.overtime).toBe(true)
  expect(levelButton('attendance', 'approve').getAttribute('aria-checked')).toBe('true')
  expect(presetButton('supervisor').getAttribute('aria-checked')).toBe('true')

  click(presetButton('manager'))
  expect(last).toEqual(presetChoice('manager', { isExternal: true }))
  expect(levelButton('crm', 'edit').getAttribute('aria-checked')).toBe('true')
})

it('changing one level away from a preset reads as Custom', () => {
  show(presetChoice('supervisor', { isExternal: true }))
  click(levelButton('tasks', 'assign'))
  expect(last.levels.tasks).toBe('assign')
  expect(presetButton('custom').getAttribute('aria-checked')).toBe('true')
})

it('a switch is disabled below its area level, and says why', () => {
  show(nothing)
  // Approving overtime needs attendance at "view" or higher.
  expect(switchOf('overtime').disabled).toBe(true)
  expect(host.querySelector('[data-switch="overtime"]')!.textContent).toContain('permissionBuilder.needsLevel')
  click(levelButton('attendance', 'view'))
  expect(switchOf('overtime').disabled).toBe(false)
  click(switchOf('overtime'))
  expect(last.switches.overtime).toBe(true)
  expect(permissionsFromChoice(last).canApproveOvertime).toBe(true)
  // Dropping the area back to none takes the switch's grant with it.
  click(levelButton('attendance', 'none'))
  expect(permissionsFromChoice(last).canApproveOvertime).toBeUndefined()
})

it('the price line flips between the observer seat and a full seat, by the keys held', () => {
  show(nothing)
  click(presetButton('observer'))
  expect(seat().dataset.seat).toBe('observer')
  expect(seat().textContent).toContain(formatCents(OBSERVER_SEAT_MONTHLY_CENTS))
  // One more ability and the seat is a full one — the preset's name never decides.
  click(levelButton('tasks', 'assign'))
  expect(seat().dataset.seat).toBe('full')
  expect(seat().textContent).toContain(formatCents(SEAT_MONTHLY_CENTS))
})

it('shows no seat line for somebody on the staff', () => {
  show(nothing, false)
  expect(seat()).toBeNull()
})

it('greys out an area whose module the workspace does not run, and a preset leaves it at none', () => {
  show(nothing, true, ['time_tracking'])
  expect(areaRow('crm').textContent).toContain('permissionBuilder.moduleOff')
  expect(levelButton('crm', 'view').disabled).toBe(true)
  click(presetButton('manager'))
  expect(last.levels.crm).toBe('none')
  expect(last.levels.attendance).toBe('approve')
  // …and an invitation never sends keys for a module the workspace lacks.
  const stale = { ...nothing, levels: { ...nothing.levels, assets: 'manage' } }
  expect(permissionsFromChoice(withoutMissingModules(stale, ['crm'])).canManageAssets).toBeUndefined()
})

it('the summary says in words what the person will be able to do', () => {
  show(presetChoice('supervisor', { isExternal: true }))
  const summary = host.querySelector('[data-testid="permission-summary"]')!.textContent
  expect(summary).toContain('permissionBuilder.areas.tasks.summary.view')
  expect(summary).toContain('permissionBuilder.areas.attendance.summary.approve')
  expect(summary).toContain('permissionBuilder.switches.overtime.summary')
  expect(host.textContent).toContain('permissionBuilder.neverExternal')
})
