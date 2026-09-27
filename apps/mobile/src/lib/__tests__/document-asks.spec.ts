import { stillNeeded, typeGroups, type AskDocument, type AskRequirement, type AskType } from '../document-asks';

const T = (id: string, extra: Partial<AskType> = {}): AskType => ({ id, label: id, direction: 'SUPPLIED', isActive: true, ...extra });
const R = (typeId: string, state: AskRequirement['state'], extra: Partial<AskRequirement> = {}): AskRequirement =>
  ({ typeId, label: typeId, state, expiresOn: null, blocksWork: false, ...extra });
const D = (typeId: string, status: string, extra: Partial<AskDocument> = {}): AskDocument =>
  ({ typeId, status, standing: null, issuedAt: '2026-09-01T00:00:00Z', ...extra });
const none = new Set<string>();

describe('a passport, through its life', () => {
  const types = [T('passport')];
  const at = (req: AskRequirement[], docs: AskDocument[] = [], queued = none) => ({
    card: stillNeeded(req, docs, queued),
    sheet: typeGroups(types, req, docs, queued),
  });

  it('not sent: asked for, on the card and in the sheet', () => {
    const { card, sheet } = at([R('passport', 'MISSING')]);
    expect(card.asked.map((r) => r.why)).toEqual(['missing']);
    expect(sheet.asked.map((r) => r.typeId)).toEqual(['passport']);
  });

  it('sent: being checked — on the card, not offered again', () => {
    const { card, sheet } = at([R('passport', 'AWAITING_REVIEW')], [D('passport', 'PENDING_VERIFICATION')]);
    expect(card.asked).toEqual([]);
    expect(card.checking).toEqual([{ typeId: 'passport', label: 'passport', onPhone: false }]);
    expect(sheet.asked).toEqual([]);
    expect(sheet.other).toEqual([]);
    expect(sheet.checking.map((r) => r.typeId)).toEqual(['passport']);
  });

  it('still on the phone with no signal counts as sent', () => {
    const { card } = at([R('passport', 'MISSING')], [], new Set(['passport']));
    expect(card.asked).toEqual([]);
    expect(card.checking[0]!.onPhone).toBe(true);
  });

  it('approved: gone from both', () => {
    const { card, sheet } = at([R('passport', 'MET')], [D('passport', 'ISSUED', { standing: 'VALID' })]);
    expect(card).toEqual({ asked: [], checking: [] });
    expect(sheet).toEqual({ asked: [], checking: [], other: [] });
  });

  it('sent back: asked for again, with the office\'s reason', () => {
    const { card } = at([R('passport', 'REJECTED')], [D('passport', 'REJECTED', { rejectionReason: ' The photo is blurred ' })]);
    expect(card.asked[0]).toMatchObject({ why: 'sentBack', reason: 'The photo is blurred' });
  });

  it('about to expire: asked for again, to send the renewed one', () => {
    const { card } = at([R('passport', 'EXPIRING', { expiresOn: '2026-10-10' })]);
    expect(card.asked[0]).toMatchObject({ why: 'expiring', expiresOn: '2026-10-10' });
  });
});

describe('types nobody asked for', () => {
  it('an approved, valid one is gone; one never sent is offered', () => {
    const g = typeGroups([T('idcard'), T('licence')], [], [D('licence', 'ISSUED', { standing: 'VALID' })], none);
    expect(g.other.map((x) => x.id)).toEqual(['idcard']);
  });

  it('one being checked is not offered twice', () => {
    const g = typeGroups([T('idcard')], [], [D('idcard', 'PENDING_VERIFICATION')], none);
    expect(g.other).toEqual([]);
    expect(g.checking.map((r) => r.typeId)).toEqual(['idcard']);
  });

  it('a refused one, or an expiring one, is offered again', () => {
    const g = typeGroups([T('a'), T('b')], [], [D('a', 'REJECTED'), D('b', 'ISSUED', { standing: 'EXPIRING' })], none);
    expect(g.other.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('the newest document decides, not the first one found', () => {
    const docs = [D('a', 'REJECTED', { issuedAt: '2026-01-01T00:00:00Z' }), D('a', 'ISSUED', { standing: 'VALID', issuedAt: '2026-06-01T00:00:00Z' })];
    expect(typeGroups([T('a')], [], docs, none).other).toEqual([]);
  });

  it('a multi-page type is always offered — as many as you need', () => {
    const g = typeGroups([T('other', { multiPage: true })], [], [D('other', 'ISSUED', { standing: 'VALID' })], none);
    expect(g.other.map((x) => x.id)).toEqual(['other']);
  });

  it('issued and switched-off types are never offered', () => {
    const g = typeGroups([T('payslip', { direction: 'ISSUED' }), T('old', { isActive: false })], [], [], none);
    expect(g).toEqual({ asked: [], checking: [], other: [] });
  });
});

it('what blocks work comes first', () => {
  const c = stillNeeded([R('a', 'MISSING'), R('b', 'MISSING', { blocksWork: true })], [], none);
  expect(c.asked.map((r) => r.typeId)).toEqual(['b', 'a']);
});
