import { countByState, formatBytes, matchesSearch, reasonKey, reasonsOf } from '../phone-sync'
import en from '../../i18n/locales/en.json'
import de from '../../i18n/locales/de.json'
import es from '../../i18n/locales/es.json'
import fr from '../../i18n/locales/fr.json'
import itLocale from '../../i18n/locales/it.json'

/**
 * The Phone sync tab reads what phones report. A reason code with no words, or
 * a state missing in one language, renders as a raw key on somebody's screen —
 * so both are pinned here.
 */
describe('phone sync', () => {
  it('counts every state, including ones with no phones', () => {
    expect(countByState([{ state: 'stuck' }, { state: 'stuck' }, { state: 'up_to_date' }])).toEqual({
      stuck: 2, needs_member: 0, sending: 0, silent: 0, up_to_date: 1,
    })
  })

  it('gives every code readable words, including codes it has never seen', () => {
    expect(reasonKey('NETWORK')).toBe('NETWORK')
    expect(reasonKey('HTTP_503')).toBe('SERVER_BUSY')
    expect(reasonKey('HTTP_429')).toBe('SERVER_BUSY')
    expect(reasonKey('SOMETHING_NEW')).toBe('OTHER')
    expect(reasonsOf({ NETWORK: 12, WAITING_FOR_WIFI: 11, ZERO: 0 }).map((r) => r.code)).toEqual(['NETWORK', 'WAITING_FOR_WIFI'])
  })

  it('has every state, reason and piece of advice in all five languages', () => {
    const codes = ['NETWORK', 'NO_RESULT', 'SERVER_BUSY', 'WAITING_FOR_WIFI', 'UNAUTHENTICATED', 'OTHER', 'TASK_REASSIGNED', 'REPORT_EXISTS']
    for (const locale of [en, de, es, fr, itLocale]) {
      const ps = (locale as any).members.phoneSync
      for (const s of ['stuck', 'needs_member', 'sending', 'silent', 'up_to_date']) {
        expect(typeof ps.states[s]).toBe('string')
        expect(typeof ps.advice[s]).toBe('string')
      }
      for (const c of codes) expect(typeof ps.reasons[c]).toBe('string')
      expect(Object.keys(ps.reasons).sort()).toEqual(Object.keys((en as any).members.phoneSync.reasons).sort())
    }
  })

  it('formats sizes a person reads', () => {
    expect(formatBytes(38 * 1024 * 1024, 'en')).toBe('38 MB')
    expect(formatBytes(9.2 * 1024 * 1024, 'en')).toBe('9.2 MB')
    expect(formatBytes(640 * 1024, 'en')).toBe('640 KB')
    expect(formatBytes(0, 'en')).toBe('0 KB')
  })

  it('searches by any words of the name or email', () => {
    const p = { firstName: 'Karim', lastName: 'Ahmad', email: 'karim@example.com' }
    expect(matchesSearch(p, 'ahmad kar')).toBe(true)
    expect(matchesSearch(p, 'example')).toBe(true)
    expect(matchesSearch(p, 'lisa')).toBe(false)
    expect(matchesSearch(undefined, 'x')).toBe(false)
    expect(matchesSearch(undefined, '')).toBe(true)
  })
})
