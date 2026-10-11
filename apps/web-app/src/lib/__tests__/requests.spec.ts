import fs from 'fs'
import path from 'path'

import {
  LEAVE_ONLY_OPTIONS,
  absencesOnly,
  draftToRequest,
  formatRequestMinutes,
  normalizeRequestOptions,
  requestDetail,
  requestKindsEnabled,
  toggleRequestKind,
} from '../requests'
import { REQUEST_KINDS } from '@hbcfield/shared/client'

/**
 * The web's words around the shared requests contract. The rules themselves
 * (which kinds exist, what is valid) are the shared module's and tested there;
 * these pin what the web adds: how a request is printed, how a form becomes a
 * body, how a workspace's switches are stored, and that a non-leave request is
 * never drawn as a day off.
 */

// A translator that shows the key and its values, so a test reads what was asked for.
const t = (key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}(${Object.entries(opts).map(([k, v]) => `${k}=${v}`).join(',')})` : key

describe('formatRequestMinutes', () => {
  it('says hours, minutes, or both', () => {
    expect(formatRequestMinutes(120, t)).toBe('requests.duration.hours(h=2)')
    expect(formatRequestMinutes(45, t)).toBe('requests.duration.minutes(m=45)')
    expect(formatRequestMinutes(150, t)).toBe('requests.duration.hoursMinutes(h=2,m=30)')
  })
})

describe('requestDetail', () => {
  it('names what is asked, per kind', () => {
    expect(requestDetail({ kind: 'LEAVE', type: 'SICK' }, t)).toBe('timeOff.reasonTypes.sickLeave')
    expect(requestDetail({ kind: null }, t)).toBe('timeOff.reasonTypes.vacation') // old rows were leave
    expect(requestDetail({ kind: 'REMOTE', space: { name: 'Main Office' } }, t)).toBe('Main Office')
    expect(requestDetail({ kind: 'HOURS', startTime: '10:00' }, t)).toBe('requests.detail.hoursStart(start=10:00)')
    expect(requestDetail({ kind: 'HOURS', startTime: '10:00', endTime: '15:00' }, t)).toBe('requests.detail.hoursBoth(start=10:00,end=15:00)')
    expect(requestDetail({ kind: 'OVERTIME', minutes: 60 }, t)).toBe('requests.detail.overtime(duration=requests.duration.hours(h=1))')
    expect(requestDetail({ kind: 'OTHER' }, t)).toBeNull()
  })
})

describe('absencesOnly', () => {
  it('keeps leave (and old rows with no kind) and drops every day worked', () => {
    const rows = [{ id: 'a', kind: 'LEAVE' }, { id: 'b' }, { id: 'c', kind: 'REMOTE' }, { id: 'd', kind: 'HOURS' }, { id: 'e', kind: 'OVERTIME' }, { id: 'f', kind: 'OTHER' }]
    expect(absencesOnly(rows).map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('draftToRequest — the form asks the SAME parser the server runs', () => {
  it('a remote day needs its workspace', () => {
    expect(draftToRequest({ kind: 'REMOTE', startDate: '2026-11-02', endDate: '2026-11-02' })).toEqual({ ok: false, code: 'REQUEST_SPACE_REQUIRED' })
    const ok = draftToRequest({ kind: 'REMOTE', startDate: '2026-11-02', endDate: '2026-11-03', spaceId: 's1', reason: ' delivery ' })
    expect(ok).toEqual({ ok: true, value: { kind: 'REMOTE', startDate: '2026-11-02', endDate: '2026-11-03', spaceId: 's1', reason: 'delivery' } })
  })

  it('a changed day and overtime are one day, whatever end the calendar held', () => {
    const r = draftToRequest({ kind: 'HOURS', startDate: '2026-11-02', endDate: '2026-11-05', startTime: '10:00' })
    expect(r.ok && r.value.endDate).toBe('2026-11-02')
    expect(draftToRequest({ kind: 'HOURS', startDate: '2026-11-02', endDate: null })).toEqual({ ok: false, code: 'REQUEST_TIME_INVALID' })
    expect(draftToRequest({ kind: 'OVERTIME', startDate: '2026-11-02', endDate: null, minutes: 5 })).toEqual({ ok: false, code: 'REQUEST_MINUTES_INVALID' })
    const ot = draftToRequest({ kind: 'OVERTIME', startDate: '2026-11-02', endDate: null, minutes: 120 })
    expect(ot.ok && ot.value.minutes).toBe(120)
  })

  it('other needs words; leave carries its type and drops what is not leave', () => {
    expect(draftToRequest({ kind: 'OTHER', startDate: '2026-11-02', endDate: null, reason: '  ' })).toEqual({ ok: false, code: 'REQUEST_REASON_REQUIRED' })
    const leave = draftToRequest({ kind: 'LEAVE', startDate: '2026-11-02', endDate: '2026-11-04', leaveType: 'FAMILY', minutes: 60, spaceId: 's1', reason: 'Family' })
    expect(leave).toEqual({ ok: true, value: { kind: 'LEAVE', startDate: '2026-11-02', endDate: '2026-11-04', type: 'FAMILY', reason: 'Family' } })
  })

  it('no dates yet is not a request', () => {
    expect(draftToRequest({ kind: 'LEAVE', startDate: null, endDate: null })).toEqual({ ok: false, code: 'REQUEST_DATES_INVALID' })
  })
})

describe('normalizeRequestOptions', () => {
  it('keeps the contract order, drops unknown kinds', () => {
    expect(normalizeRequestOptions({ kinds: ['OTHER', 'BOGUS', 'LEAVE'], remoteSpaces: [] })).toEqual({ kinds: ['LEAVE', 'OTHER'], remoteSpaces: [] })
  })
  it('never offers a remote day with nowhere to file it', () => {
    expect(normalizeRequestOptions({ kinds: ['LEAVE', 'REMOTE'], remoteSpaces: [] }).kinds).toEqual(['LEAVE'])
    expect(normalizeRequestOptions({ kinds: ['LEAVE', 'REMOTE'], remoteSpaces: [{ id: 's', name: 'HQ', extra: 1 }] })).toEqual({
      kinds: ['LEAVE', 'REMOTE'],
      remoteSpaces: [{ id: 's', name: 'HQ' }],
    })
  })
  it('falls back to leave alone on anything unreadable', () => {
    expect(normalizeRequestOptions(null)).toEqual(LEAVE_ONLY_OPTIONS)
    expect(normalizeRequestOptions({ kinds: [] })).toEqual(LEAVE_ONLY_OPTIONS)
  })
})

describe("a workspace's request switches (empty list = every kind)", () => {
  it('reads empty as all on', () => {
    expect(requestKindsEnabled([])).toEqual([...REQUEST_KINDS])
    expect(requestKindsEnabled(null)).toEqual([...REQUEST_KINDS])
    expect(requestKindsEnabled(['OTHER', 'LEAVE'])).toEqual(['LEAVE', 'OTHER'])
  })
  it('switching one off from "all" stores the rest', () => {
    expect(toggleRequestKind([], 'OVERTIME', false)).toEqual(['LEAVE', 'REMOTE', 'HOURS', 'OTHER'])
  })
  it('switching the last one back on stores [] again', () => {
    expect(toggleRequestKind(['LEAVE', 'REMOTE', 'HOURS', 'OTHER'], 'OVERTIME', true)).toEqual([])
  })
  it('refuses to switch the last kind off — empty would mean every kind', () => {
    expect(toggleRequestKind(['LEAVE'], 'LEAVE', false)).toBeNull()
  })
})

describe('i18n: every kind and refusal is said in all five languages', () => {
  const dir = path.join(__dirname, '../../i18n/locales')
  const codes = [
    'REQUEST_KIND_INVALID', 'REQUEST_DATES_INVALID', 'REQUEST_TYPE_INVALID', 'REQUEST_SPACE_REQUIRED', 'REQUEST_TIME_INVALID',
    'REQUEST_MINUTES_INVALID', 'REQUEST_REASON_REQUIRED', 'REQUEST_REASON_TOO_LONG', 'REQUEST_TOO_MANY_DAYS',
    'REQUEST_REMOTE_NOT_ALLOWED', 'REQUEST_SPACE_NOT_YOURS', 'REQUEST_KIND_NOT_OFFERED',
  ]
  for (const lang of ['en', 'de', 'es', 'fr', 'it']) {
    it(lang, () => {
      const j = JSON.parse(fs.readFileSync(path.join(dir, `${lang}.json`), 'utf8'))
      for (const k of REQUEST_KINDS) {
        for (const part of ['label', 'hint', 'effect']) expect(typeof j.requests.kinds[k][part]).toBe('string')
      }
      for (const c of codes) expect(typeof j.serverErrors[c]).toBe('string')
      expect(typeof j.technicians.attendanceTab.flag.approvedRemote).toBe('string')
      // House rule: no "paid"/"unpaid" anywhere in what we added.
      expect(JSON.stringify(j.requests)).not.toMatch(/\b(un)?paid\b/i)
    })
  }
})
