/**
 * The builder's "Ask when moving here" panel: a legacy step offers Customise
 * (the field-service preset as the org's own) and Ask nothing ({ fields: [] });
 * the eight "+ add" buttons append a field; a reader without the right sees it
 * and cannot change it.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { STEP_FORM_FIELD_TYPES, STEP_FORM_PRESETS } from '@hbcfield/shared/client'
import type { StepFormDraft } from '@/lib/step-forms'

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

// eslint-disable-next-line import/first
import { StepFormEditor } from '../step-form-editor'

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
})

const btn = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text))

it('a legacy step: Customise copies the field-service preset, Ask nothing sets an empty list', () => {
  const onChange = jest.fn<void, [StepFormDraft]>()
  act(() => root.render(<StepFormEditor stepName="Done" mode="legacy" draft={null} onChange={onChange} editable crmAvailable />))
  expect(host.textContent).toContain('stepForm.legacy.title')
  act(() => btn('stepForm.legacy.customise')!.click())
  expect(onChange.mock.calls[0]![0]!.fields.map((f) => f.id)).toEqual(STEP_FORM_PRESETS.fieldService.fields.map((f) => f.id))
  act(() => btn('stepForm.legacy.askNothing')!.click())
  expect(onChange.mock.calls[1]![0]).toEqual({ fields: [] })
})

it('offers "+ add" for all eight types, and appends one', () => {
  const onChange = jest.fn<void, [StepFormDraft]>()
  const draft = { fields: [{ id: 'a', type: 'note' as const, label: 'Notes', required: true }] }
  act(() => root.render(<StepFormEditor stepName="Visit" mode="own" draft={draft} onChange={onChange} editable crmAvailable={false} />))
  for (const type of STEP_FORM_FIELD_TYPES) expect(host.querySelector(`[data-testid="add-${type}"]`)).not.toBeNull()
  act(() => (host.querySelector('[data-testid="add-date"]') as HTMLButtonElement).click())
  const next = onChange.mock.calls[0]![0]!
  expect(next.fields.map((f) => f.type)).toEqual(['note', 'date'])
})

it('shows a live definition problem on the field', () => {
  const draft = { fields: [{ id: 'c', type: 'choice' as const, label: 'Pick', required: false, options: ['one'] }] }
  act(() => root.render(<StepFormEditor stepName="Visit" mode="own" draft={draft} onChange={() => {}} editable crmAvailable />))
  expect(host.querySelector('[data-testid="def-error-c"]')?.textContent).toContain('stepForm.definitionError.options_required')
})

it('read-only for someone who may not edit workflows', () => {
  const draft = { fields: [{ id: 'a', type: 'note' as const, label: 'Notes', required: true }] }
  act(() => root.render(<StepFormEditor stepName="Visit" mode="own" draft={draft} onChange={() => {}} editable={false} crmAvailable />))
  expect(host.querySelector('input')).toBeNull()
  expect(host.querySelector('[data-testid="add-note"]')).toBeNull()
  expect(host.textContent).toContain('stepForm.readOnly')
})
