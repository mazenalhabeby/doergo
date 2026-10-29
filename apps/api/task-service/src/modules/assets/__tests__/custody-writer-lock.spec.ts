import { CustodyWriterService } from '../custody/custody-writer.service';

/**
 * Two handovers at once must not leave two open periods: the writer locks the
 * asset row (FOR UPDATE) BEFORE it reads the open periods it plans from, so the
 * second transaction waits and sees what the first wrote.
 */
describe('CustodyWriterService.apply — one handover at a time per asset', () => {
  it('locks the asset row before reading its open periods', async () => {
    const order: string[] = [];
    const db: any = {
      $queryRaw: jest.fn(async (sql: TemplateStringsArray, ...values: unknown[]) => {
        order.push(`lock:${sql.join('?')}:${values.join(',')}`);
        return [];
      }),
      assetCustody: {
        findMany: jest.fn(async () => (order.push('read'), [])),
        updateMany: jest.fn(),
        createMany: jest.fn(),
      },
      assetHolder: { findMany: jest.fn(async () => []), deleteMany: jest.fn(), createMany: jest.fn() },
    };
    await new CustodyWriterService().apply(db, {
      assetId: 'a1',
      organizationId: 'o1',
      actorId: 'admin',
      to: [{ userId: 'u1' }],
      limit: 1,
    });
    expect(order[0]).toMatch(/^lock:SELECT id FROM "assets" WHERE id = \? FOR UPDATE:a1$/);
    expect(order[1]).toBe('read');
  });
});
