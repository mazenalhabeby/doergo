import { stripItems, stripLines, stripTone, itemLines } from '../../features/home/action-strip-state';

const none = { toUpload: [], rejected: [], toSign: [], expiringSoon: [] };
const NOW = Date.parse('2026-09-26T10:00:00Z');

describe('the action strip', () => {
  it('draws nothing when nothing waits', () => {
    expect(stripLines(stripItems(none))).toBeNull();
  });

  it('one item names it, and carries where it goes', () => {
    const items = stripItems({ ...none, toSign: [{ id: 'd1', title: 'Time sheet September', forMember: 'Mike Weber' }] });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'countersign', documentId: 'd1' });
    expect(stripLines(items)!.title).toEqual({ key: 'strip.item.countersign', values: { name: 'Mike', label: 'Time sheet September' } });
    // the sub-line says whose document it is ONCE — no repeated age suffix
    expect(itemLines(items[0]!).sub).toEqual({ key: 'strip.item.countersignSub', values: { name: 'Mike Weber' } });
  });

  it('ranks sent back & blocking first, running out last', () => {
    const items = stripItems({
      toUpload: [{ typeId: 'a', label: 'First aid', blocksWork: false }, { typeId: 'b', label: 'ID card', blocksWork: true }],
      rejected: [{ typeId: 'c', label: 'Licence', blocksWork: false }],
      toSign: [{ id: 'd', title: 'Contract' }, { id: 'e', title: 'Time sheet', forMember: 'Mike Weber' }],
      expiringSoon: [{ typeId: 'f', label: 'Passport', expiresOn: '2026-10-08' }],
    }, NOW);
    expect(items.map((i) => i.key)).toEqual(['up:b', 'back:c', 'sign:d', 'sign:e', 'up:a', 'exp:f']);
    expect(items[5]!.daysLeft).toBe(12);
  });

  it('with several, never names one task as the title', () => {
    const items = stripItems({ ...none, toSign: [{ id: 'd', title: 'Contract' }, { id: 'e', title: 'Handbook' }] });
    expect(stripLines(items)!.title.key).toBe('strip.needYou');
    expect(stripLines(items)!.sub).toEqual({ key: 'strip.line.toSign', values: { count: 2 } });
  });

  it('red only when work is stopped, and the stake leads', () => {
    const all = stripItems({ ...none, toUpload: [{ typeId: 'a', label: 'ID', blocksWork: true }, { typeId: 'b', label: 'Permit', blocksWork: true }] });
    expect(stripTone(all)).toBe('crit');
    expect(stripLines(all)).toEqual({ title: { key: 'strip.stopping', values: { count: 2 } }, sub: { key: 'strip.line.nothingReaches' } });

    const mixed = stripItems({ ...none, toUpload: [{ typeId: 'a', label: 'ID', blocksWork: true }], toSign: [{ id: 'd', title: 'Contract' }] });
    expect(stripLines(mixed)!.sub).toEqual({ key: 'strip.line.someStop', values: { count: 1 } });
  });

  it('only running out is a mention: no tint', () => {
    const items = stripItems({ ...none, expiringSoon: [{ typeId: 'a', label: 'Licence', expiresOn: null }, { typeId: 'b', label: 'Passport', expiresOn: null }] });
    expect(stripTone(items)).toBe('calm');
    expect(stripLines(items)!.sub.key).toBe('strip.line.neitherUrgent');
  });

  it('a colleague waiting beats a count', () => {
    const items = stripItems({ ...none, toSign: [{ id: 'd', title: 'Contract' }, { id: 'e', title: 'Time sheet', forMember: 'Mike Weber' }] });
    expect(stripLines(items)!.sub).toEqual({ key: 'strip.line.waitingOnYou', values: { name: 'Mike Weber' } });
  });
});
