import {
  sanitizeLabelValueRows,
  CUSTOMER_DETAIL_LIMITS,
  UNIT_DETAIL_LIMITS,
} from '../records/label-value-rows';
import { keepOrgUserIds } from '../records/org-user-ids';

/** The CRM's and the portal's copies, now one function each — limits kept per caller. */
describe('sanitizeLabelValueRows', () => {
  it('keeps well-formed rows only, trimmed, with a label', () => {
    expect(sanitizeLabelValueRows([{ label: ' Gate ', value: ' 4471 ' }, { label: ' ', value: 'x' }, { label: 1, value: 'x' }, null], CUSTOMER_DETAIL_LIMITS))
      .toEqual([{ label: 'Gate', value: '4471' }]);
  });
  it('is undefined for a non-list (leave it alone), [] for an empty one (clear it)', () => {
    expect(sanitizeLabelValueRows('x', UNIT_DETAIL_LIMITS)).toBeUndefined();
    expect(sanitizeLabelValueRows([], UNIT_DETAIL_LIMITS)).toEqual([]);
  });
  it("keeps each caller's own limits: client 2000 chars × 30 rows, address 500 × 40", () => {
    const long = 'v'.repeat(3000);
    const rows = Array.from({ length: 50 }, (_, i) => ({ label: `L${i}`, value: long }));
    const client = sanitizeLabelValueRows(rows, CUSTOMER_DETAIL_LIMITS)!;
    const unit = sanitizeLabelValueRows(rows, UNIT_DETAIL_LIMITS)!;
    expect(client).toHaveLength(30);
    expect(client[0].value).toHaveLength(2000);
    expect(unit).toHaveLength(40);
    expect(unit[0].value).toHaveLength(500);
  });
});

describe('keepOrgUserIds', () => {
  const prisma = (found: string[]) => ({ user: { findMany: jest.fn().mockResolvedValue(found.map((id) => ({ id }))) } });

  it('drops ids outside the organization and asks scoped to it', async () => {
    const p = prisma(['a']);
    await expect(keepOrgUserIds(p, ['a', 'b'], 'org1')).resolves.toEqual(['a']);
    expect(p.user.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['a', 'b'] }, organizationId: 'org1' });
  });
  it('dedupes and drops non-strings; caps only when asked', async () => {
    const ids = ['a', 'a', '', 7, ...Array.from({ length: 30 }, (_, i) => `u${i}`)];
    const all = ['a', ...Array.from({ length: 30 }, (_, i) => `u${i}`)];
    await expect(keepOrgUserIds(prisma(all), ids, 'org1')).resolves.toHaveLength(31);
    await expect(keepOrgUserIds(prisma(all), ids, 'org1', { cap: 20 })).resolves.toHaveLength(20);
  });
  it('does not query for nothing', async () => {
    const p = prisma([]);
    await expect(keepOrgUserIds(p, [], 'org1')).resolves.toEqual([]);
    expect(p.user.findMany).not.toHaveBeenCalled();
  });
});
