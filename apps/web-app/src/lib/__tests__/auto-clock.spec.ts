import { AUTO_CLOCK_DEFAULTS, AUTO_CLOCK_LIMITS } from '@hbcfield/shared/client'

import {
  AUTO_CLOCK_FIELDS,
  autoClockAvailability,
  autoClockConsent,
  autoClockDirty,
  autoClockFieldError,
  autoClockForm,
  autoClockSubmission,
  savedAutoClock,
} from '../auto-clock'

/**
 * The workspace's "Automatic clock" form. The RULES are the shared parser's
 * (and tested there); these pin that the web form asks exactly that parser —
 * so it can never accept a number the server will refuse — and how it reads
 * what an older server does not send.
 */

const defaults = () => autoClockForm(AUTO_CLOCK_DEFAULTS)

describe('savedAutoClock', () => {
  it('reads an absent field (an older server) and null as OFF with the defaults', () => {
    expect(savedAutoClock(undefined)).toEqual(AUTO_CLOCK_DEFAULTS)
    expect(savedAutoClock(null)).toEqual(AUTO_CLOCK_DEFAULTS)
  })

  it('reads stored settings leniently — a stored value outside today\'s limits takes the default', () => {
    const s = savedAutoClock({ enabled: true, leadMinutes: 999, dwellMinutes: 5 })
    expect(s.enabled).toBe(true)
    expect(s.leadMinutes).toBe(AUTO_CLOCK_DEFAULTS.leadMinutes)
    expect(s.dwellMinutes).toBe(5)
  })
})

describe('autoClockSubmission', () => {
  it('turns the defaults into the body the server takes', () => {
    const r = autoClockSubmission(defaults(), true)
    expect(r).toEqual({ ok: true, value: { ...AUTO_CLOCK_DEFAULTS, enabled: true } })
  })

  it.each(Object.entries(AUTO_CLOCK_LIMITS))('refuses %s above its limit, naming the field — never clamped', (field, [, max]) => {
    const form = { ...defaults(), restOn: true, [field]: String(max + 1) }
    const r = autoClockSubmission(form, true)
    expect(r).toEqual({ ok: false, field })
  })

  it('refuses text that is not a whole number instead of dropping it', () => {
    expect(autoClockSubmission({ ...defaults(), dwellMinutes: '2.5' }, true)).toEqual({ ok: false, field: 'dwellMinutes' })
    expect(autoClockSubmission({ ...defaults(), dwellMinutes: '' }, true)).toEqual({ ok: false, field: 'dwellMinutes' })
    expect(autoClockSubmission({ ...defaults(), dwellMinutes: '-1' }, true)).toEqual({ ok: false, field: 'dwellMinutes' })
  })

  it('sends the rest as null when it is switched off, whatever is in its box', () => {
    const r = autoClockSubmission({ ...defaults(), restOn: false, autoRestMinutes: 'abc' }, true)
    expect(r.ok && r.value.autoRestMinutes).toBeNull()
    const on = autoClockSubmission({ ...defaults(), restOn: true, autoRestMinutes: '45' }, true)
    expect(on.ok && on.value.autoRestMinutes).toBe(45)
  })

  it('refuses closing the shift no later than telling the leader — the one rule between two fields', () => {
    const form = { ...defaults(), leaderAfterMinutes: '60', closeAfterMinutes: '60' }
    expect(autoClockSubmission(form, true)).toEqual({ ok: false, field: 'closeAfterMinutes' })
    expect(autoClockFieldError('closeAfterMinutes', form).key).toBe('attendance.autoClock.errorAfterLeader')
  })

  it('says the range for an out-of-range number', () => {
    const form = { ...defaults(), leadMinutes: '500' }
    expect(autoClockFieldError('leadMinutes', form)).toEqual({ key: 'attendance.autoClock.errorRange', params: { min: 0, max: 180 } })
  })
})

describe('autoClockDirty', () => {
  it('is clean on the saved values and dirty after an edit', () => {
    expect(autoClockDirty(defaults(), AUTO_CLOCK_DEFAULTS)).toBe(false)
    expect(autoClockDirty({ ...defaults(), dwellMinutes: '4' }, AUTO_CLOCK_DEFAULTS)).toBe(true)
  })

  it('ignores the rest\'s length while the rest is off, and notices switching it', () => {
    expect(autoClockDirty({ ...defaults(), autoRestMinutes: '50' }, AUTO_CLOCK_DEFAULTS)).toBe(false)
    expect(autoClockDirty({ ...defaults(), restOn: true }, AUTO_CLOCK_DEFAULTS)).toBe(true)
  })
})

describe('autoClockAvailability', () => {
  it('is not offered for the Remote bucket, explained for a workspace with no map point', () => {
    expect(autoClockAvailability({ isRemote: true, lat: 1, lng: 2 })).toBe('remote')
    expect(autoClockAvailability({ lat: null, lng: null })).toBe('noCoordinates')
    expect(autoClockAvailability({ lat: 47.98, lng: 13.82 })).toBe('ok')
  })
})

describe('autoClockConsent', () => {
  it('reads agreed, not agreed, and says nothing when the server did not send it', () => {
    expect(autoClockConsent({ autoClockConsentAt: '2026-10-11T08:00:00.000Z' })).toEqual({ state: 'agreed', at: '2026-10-11T08:00:00.000Z' })
    expect(autoClockConsent({ autoClockConsentAt: null })).toEqual({ state: 'notAgreed' })
    expect(autoClockConsent({ user: { autoClockConsentAt: null } })).toEqual({ state: 'notAgreed' })
    expect(autoClockConsent({})).toEqual({ state: 'unknown' })
    expect(autoClockConsent(undefined)).toEqual({ state: 'unknown' })
  })
})

it('asks every field the shared contract limits', () => {
  expect([...AUTO_CLOCK_FIELDS].sort()).toEqual(Object.keys(AUTO_CLOCK_LIMITS).sort())
})
