import { Prisma } from '@prisma/client';
import { overtimeWriteMissed } from '../../attendance/extra-time/overtime-rule-facts';
const roleHolderIds = jest.fn();
jest.mock('@hbcfield/shared', () => ({
  ...jest.requireActual('@hbcfield/shared'),
  roleHolderIds: (...a: unknown[]) => roleHolderIds(...a),
}));
import { BatchNotices } from './approval-step-notices';

/*
  Two overtime decisions at once never add it twice; a batch tells the next approvers once per role and workspace —
  naming the person only when it is about one person — and every place that starts a batch ends it.
*/
const missed = new Prisma.PrismaClientKnownRequestError('miss', { code: 'P2025', clientVersion: 'x' });

describe('overtimeWriteMissed', () => {
  const prisma = (newerRounds: number) =>
    ({
      timeEntry: { count: jest.fn(async () => 1) },
      overtimeRequest: { count: jest.fn(async () => newerRounds) },
    }) as never;

  it('somebody else added a round meanwhile → already decided (a retry would add it twice)', async () => {
    await expect(overtimeWriteMissed(prisma(1), 'e1', { afterCycle: 2 })(missed)).rejects.toMatchObject({
      response: { code: 'OVERTIME_ALREADY_DECIDED' },
    });
  });

  it('only the end moved (no new round) → changed meanwhile, look again', async () => {
    await expect(overtimeWriteMissed(prisma(0), 'e1', { afterCycle: 2 })(missed)).rejects.toMatchObject({
      response: { code: 'CHANGED_MEANWHILE' },
    });
  });

  it('any other error is passed on as it is', async () => {
    const boom = new Error('db down');
    await expect(overtimeWriteMissed(prisma(0), 'e1', { afterCycle: 0 })(boom)).rejects.toBe(boom);
  });
});

describe('BatchNotices', () => {
  const input = (subjectId: string, itemId: string) => ({
    organizationId: 'o',
    kind: 'hours' as const,
    itemId,
    facts: { spaceIds: ['s1'] },
    deciderId: 'lead',
    subjectId,
    subjectName: subjectId,
  });
  const flush = async (batch: BatchNotices) => {
    roleHolderIds.mockReset().mockResolvedValue(['hr1']);
    const notices = { emit: jest.fn() };
    await batch.flush({} as never, notices as never, { warn: jest.fn() } as never);
    return {
      sent: notices.emit.mock.calls.map((c) => c[1]),
      exclude: roleHolderIds.mock.calls.map((c) => (c[1] as { exclude: string[] }).exclude),
    };
  };

  it("thirty people approved at once: ONE push per role and workspace, without one person's name", async () => {
    const batch = new BatchNotices();
    for (let i = 0; i < 30; i++) batch.add('hr', input(`w${i}`, `e${i}`), 'Lea');
    const { sent, exclude } = await flush(batch);
    expect(sent).toHaveLength(1);
    expect(sent[0].subjectName).toBe('');
    // Only the decider is left out: each person in the batch may decide the others' items.
    expect(exclude[0]).toEqual(['lead']);
  });

  it("one person's days: named, as a single approval would be", async () => {
    const batch = new BatchNotices();
    batch.add('hr', input('w1', 'e1'), 'Lea');
    batch.add('hr', input('w1', 'e2'), 'Lea');
    const { sent } = await flush(batch);
    expect(sent).toHaveLength(1);
    expect(sent[0].subjectName).toBe('w1');
  });

  it('two workspaces: one push each', async () => {
    const batch = new BatchNotices();
    batch.add('hr', input('w1', 'e1'), 'Lea');
    batch.add('hr', { ...input('w2', 'e2'), facts: { spaceIds: ['s2'] } }, 'Lea');
    expect((await flush(batch)).sent).toHaveLength(2);
  });
});

describe('every batch is ended', () => {
  it('each file that starts a BatchNotices also sends it (tellBatch / flush) — or nobody would ever be told', () => {
    const { execSync } = jest.requireActual('child_process');
    const root = require('path').resolve(__dirname, '../../..');
    const files: string[] = execSync(`grep -rl "new BatchNotices()" ${root} --include=*.ts`, { encoding: 'utf8' })
      .split('\n')
      .filter((f: string) => f && !f.endsWith('.spec.ts'));
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const f of files) {
      const src: string = require('fs').readFileSync(f, 'utf8');
      expect({ f, ends: /tellBatch\(|\.flush\(/.test(src) }).toEqual({ f, ends: true });
    }
  });
});
