import { formatDistance } from '../utils/distance';
import { formatDuration } from '../utils/date';
import { formatMoney } from '../utils/money';
import type { ApprovalItem } from './approval-kinds';

/**
 * What one waiting decision says, in the reader's language — web and phone.
 *
 * `headline` is the row's first line; `facts` are the detail's label/value
 * pairs. Times are written in the WORKSPACE's zone when the item carries one —
 * a shift in Texas read from Vienna is still '06:00–14:30'.
 *
 * Every word comes from the app's `approvals.*` catalogue (both apps carry the
 * same keys; `approval-text.spec` checks them), through the `t` it is given.
 */
export type ApprovalT = (key: string, opts?: Record<string, unknown>) => string;
export interface ApprovalText {
  headline: string
  facts: Array<{ label: string; value: string; tone?: 'warn' | 'bad' }>
}

type Data = Record<string, unknown>
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function when(locale: string, iso: unknown, tz?: string | null, withDate = true): string | null {
  const s = str(iso)
  if (!s) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  const opts: Intl.DateTimeFormatOptions = withDate
    ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
    : { hour: '2-digit', minute: '2-digit' }
  try {
    return new Intl.DateTimeFormat(locale, { ...opts, ...(tz ? { timeZone: tz } : {}) }).format(d)
  } catch {
    return new Intl.DateTimeFormat(locale, opts).format(d)
  }
}

/** A date-only value (leave, a document's expiry) — read as the calendar day it names. */
function day(locale: string, iso: unknown): string | null {
  const s = str(iso)
  if (!s) return null
  const d = new Date(s.length === 10 ? `${s}T12:00:00Z` : s)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d)
}

const camel = (flag: string) => flag.toLowerCase().replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

export function describeApproval(item: ApprovalItem, t: ApprovalT, locale: string, orgCurrency?: string | null): ApprovalText {
  const d = item.data as Data
  const tz = str(d.timezone)
  const facts: ApprovalText['facts'] = []
  const add = (labelKey: string, value: string | null | undefined, tone?: 'warn' | 'bad') => {
    if (value) facts.push({ label: t(`approvals.fact.${labelKey}`), value, tone })
  }

  switch (item.kind) {
    case 'hours': {
      const from = when(locale, d.clockInAt, tz)
      const to = when(locale, d.clockOutAt, tz, false)
      add('shift', from && to ? `${from} – ${to}` : from)
      add('worked', num(d.minutes) != null ? formatDuration(num(d.minutes)) : null)
      const flags = (str(d.flags) ?? '').split(',').filter(Boolean)
      add('flags', flags.map((f) => t(`approvals.flag.${camel(f)}`, { defaultValue: f })).join(', ') || null, 'warn')
      return { headline: t('approvals.headline.hours'), facts }
    }
    case 'away':
      add('left', when(locale, d.leftAt))
      add('asked', num(d.requestedMinutes) != null ? formatDuration(num(d.requestedMinutes)) : null)
      add('distance', num(d.distanceM) != null ? formatDistance(num(d.distanceM), { locale: locale }) : null)
      add('reason', str(d.reason))
      return { headline: t('approvals.headline.away'), facts }
    case 'extraTime':
      add('clockedIn', when(locale, d.clockInAt, tz))
      add('plannedEnd', when(locale, d.plannedEnd, tz))
      if (d.stillWorking === true) add('status', t('approvals.stillWorking'), 'warn')
      return { headline: t('approvals.headline.extraTime'), facts }
    case 'overtime':
      add('from', when(locale, d.overtimeStartAt))
      add('round', num(d.cycle) != null ? String(num(d.cycle)) : null)
      add('reason', str(d.reason))
      return { headline: t('approvals.headline.overtime'), facts }
    case 'request': {
      const kind = str(d.requestKind) ?? 'LEAVE'
      const label = kind === 'LEAVE' && str(d.type)
        ? t(`approvals.leave.${d.type}`, { defaultValue: String(d.type) })
        : t(`approvals.requestKind.${kind}`, { defaultValue: kind })
      const start = day(locale, d.startDate)
      const end = day(locale, d.endDate)
      add('period', start && end && start !== end ? `${start} – ${end}` : start)
      if (str(d.startTime) || str(d.endTime)) add('hours', `${str(d.startTime) ?? '…'} – ${str(d.endTime) ?? '…'}`)
      add('days', num(d.workingDays) != null ? String(num(d.workingDays)) : null)
      add('asked', num(d.minutes) != null ? formatDuration(num(d.minutes)) : null)
      const level = str(d.coverLevel)
      if (level) {
        const worst = num(d.coverWorst)
        const floor = num(d.coverFloor)
        const line = t(`approvals.cover.${level}`, { defaultValue: level })
        // A floor of 0 means none was SET, not 'nobody needed'.
        add('cover', worst != null && floor != null && floor > 0 ? `${line} · ${t('approvals.cover.line', { worst, floor })}` : line,
          level === 'ok' ? undefined : level === 'tight' ? 'warn' : 'bad')
      }
      add('reason', str(d.reason))
      return { headline: label, facts }
    }
    case 'noShow':
      add('expected', when(locale, d.expectedClockInAt))
      add('shiftEnds', when(locale, d.expectedClockOutAt, null, false))
      return { headline: t('approvals.headline.noShow'), facts }
    case 'issue':
      add('severity', str(d.severity) ? t(`approvals.priority.${d.severity}`, { defaultValue: String(d.severity) }) : null,
        d.severity === 'URGENT' || d.severity === 'HIGH' ? 'bad' : undefined)
      add('assignee', str(d.assigneeName))
      return { headline: str(d.title) ?? t('approvals.kinds.issue'), facts }
    case 'expense':
      add('amount', num(d.amountCents) != null ? formatMoney(num(d.amountCents), str(d.currency) ?? orgCurrency ?? 'EUR', locale) : null)
      add('category', str(d.category))
      add('date', day(locale, d.occurredAt))
      add('receipt', d.hasReceipt ? t('approvals.yes') : t('approvals.no'))
      return { headline: str(d.assetName) ?? t('approvals.kinds.expense'), facts }
    case 'assetProposal':
      add('asset', str(d.name))
      add('plate', str(d.plate))
      add('holder', str(d.holderName))
      return { headline: t('approvals.headline.assetProposal'), facts }
    case 'document':
      add('type', str(d.typeLabel))
      add('expires', day(locale, d.expiresOn))
      if (d.blocksWork === true) add('status', t('approvals.blocksWork'), 'bad')
      return { headline: str(d.title) ?? t('approvals.kinds.document'), facts }
    case 'join':
      add('email', str(d.email))
      add('message', str(d.message))
      return { headline: t('approvals.headline.join'), facts }
    case 'clientRequest':
      add('reference', str(d.reference))
      add('unit', str(d.unitName))
      add('priority', str(d.priority) ? t(`approvals.priority.${d.priority}`, { defaultValue: String(d.priority) }) : null)
      return { headline: str(d.title) ?? t('approvals.kinds.clientRequest'), facts }
    case 'guestRequest':
      add('message', str(d.note))
      return { headline: str(d.title) ?? t('approvals.kinds.guestRequest'), facts }
  }
}
