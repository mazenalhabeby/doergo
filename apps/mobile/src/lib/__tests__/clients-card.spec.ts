import { headline, rowLines, daysLate } from '../../components/home/clients-state';
import type { DueReminder } from '../api/customers';

const r = (over: Partial<DueReminder>): DueReminder => ({
  id: 'a', customerId: 'c', name: 'Siemens AG', type: 'COMPANY', kind: 'CALL', note: null, dueAt: null,
  shared: 0, phone: null, email: null, ...over,
});
const due = (counts: { call?: number; email?: number; other?: number; overdue?: number }, items: DueReminder[] = []) => {
  const c = { call: 0, email: 0, other: 0, overdue: 0, ...counts };
  return { total: c.call + c.email + c.other, counts: c, items };
};

describe('the Clients card', () => {
  it('says nothing when nothing is owed', () => {
    expect(headline(due({}))).toBeNull();
  });

  it('one kind: names it, and still says how many are late', () => {
    const h = headline(due({ call: 3, overdue: 2 }))!;
    expect(h.title.key).toBe('clientsCard.owedCallLabel');
    expect(h.split.map((p) => p.key)).toEqual(['clientsCard.split.overdue', 'clientsCard.split.todayCount']);
  });

  it('two emails, neither late: "both today"', () => {
    const h = headline(due({ email: 2 }))!;
    expect(h.title.key).toBe('clientsCard.owedEmailLabel');
    expect(h.split).toEqual([{ key: 'clientsCard.split.bothToday' }]);
  });

  it('several kinds: counts them, and names the split', () => {
    const h = headline(due({ call: 2, email: 1, other: 2 }))!;
    expect(h.title.key).toBe('clientsCard.needYouLabel');
    expect(h.split.map((p) => p.values?.count)).toEqual([2, 1, 2]);
  });

  it('only "other": counts, never "owed a call"', () => {
    expect(headline(due({ other: 2 }))!.title.key).toBe('clientsCard.needYouLabel');
  });

  it('says when a reminder is not yours alone', () => {
    const h = headline(due({ call: 2 }, [r({ shared: 3 }), r({ id: 'b' })]))!;
    expect(h.split.at(-1)).toEqual({ key: 'clientsCard.split.notYoursAlone', values: { count: 1 } });
  });

  it('a row leads with the verb and always says it is a reminder', () => {
    expect(rowLines(r({ note: 'quote sent 11 Sep' }))).toEqual({
      title: { key: 'clientsCard.row.ring', values: { name: 'Siemens AG' } },
      reason: { key: 'clientsCard.row.ringWhy', values: { note: 'quote sent 11 Sep' } },
    });
    expect(rowLines(r({ kind: 'EMAIL' })).reason).toEqual({ key: 'clientsCard.row.emailReason' });
  });

  it('OTHER: the note is the title, the client moves underneath', () => {
    expect(rowLines(r({ kind: 'OTHER', note: 'Drop the keys back', name: 'Billa AG' }))).toEqual({
      title: { key: 'clientsCard.row.note', values: { note: 'Drop the keys back' } },
      reason: { key: 'clientsCard.row.otherReason', values: { name: 'Billa AG' } },
    });
  });

  it('late is whole days before the start of the member’s day', () => {
    const start = new Date('2026-09-26T00:00:00');
    expect(daysLate(new Date('2026-09-22T09:00:00').toISOString(), start)).toBe(4);
    expect(daysLate(new Date('2026-09-26T14:00:00').toISOString(), start)).toBeNull();
  });
});
