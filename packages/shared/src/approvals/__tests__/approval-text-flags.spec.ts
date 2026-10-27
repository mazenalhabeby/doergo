import { describeApproval } from '../approval-text';
import type { ApprovalItem } from '../approval-kinds';

/*
  An entry's labels in the inbox read the ONE label catalogue the attendance screens use — never a raw code
  ("HOURS_CHANGED" was shown as itself, in every language, on exactly the entries an hours rule holds).
*/
describe('describeApproval — the labels on an hours item', () => {
  const t = (key: string, o?: { defaultValue?: string }) => o?.defaultValue ?? key;
  const item = {
    kind: 'hours',
    id: 'e1',
    data: { flags: 'HOURS_CHANGED,LATE_ARRIVAL,OUTSIDE_GEOFENCE' },
  } as unknown as ApprovalItem;
  const flags = (locale: string) =>
    describeApproval(item, t as never, locale).facts.find((f) => f.label === 'approvals.fact.flags')?.value;

  it('in the reader’s language, from the shared label words', () => {
    expect(flags('en')).toBe('Hours changed by hand, Late, OUTSIDE_GEOFENCE');
    expect(flags('de')).toContain('Zeiten von Hand geändert');
  });
});
