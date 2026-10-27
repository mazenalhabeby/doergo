import { PrismaService } from '@hbcfield/shared';
import { ApprovalRulesService } from './approval-rules.service';

/*
  The guarantees a fake database cannot prove — against a REAL one (the local dev database, demo organization).
  Off by default: `APPROVALS_DB_TEST=1 npx jest approval-rules.db` with DATABASE_URL set. Everything it makes is
  removed again.

  - Two people approving FIRST at the same instant: the partial unique index lets exactly one open the step; the
    other is judged as the next approval (and refused here — they hold no role the rule names).
  - A batch opened twice (a retry): `createMany({ skipDuplicates })` respects the partial index — no duplicates,
    no error.
*/
const run = process.env.APPROVALS_DB_TEST === '1' ? describe : describe.skip;

run('office rules against a real database', () => {
  const prisma = new PrismaService();
  const svc = new ApprovalRulesService(prisma, { emit: jest.fn() } as never);
  const tag = `dbtest-${Date.now()}`;
  let org = '';
  let ruleId = '';
  let people: string[] = [];

  beforeAll(async () => {
    const owner = await prisma.user.findFirstOrThrow({ where: { email: 'client@example.com' } });
    org = owner.organizationId!;
    const members = await prisma.user.findMany({
      where: { organizationId: org, role: 'EMPLOYEE', isActive: true, memberRoleId: { not: null } },
      take: 2,
    });
    people = members.map((m) => m.id);
    // Two people, or the "same instant" test proves nothing.
    expect(people).toHaveLength(2);
    // A role neither of them holds: nobody here can give the next approval.
    const role = await prisma.accessRole.findFirstOrThrow({
      where: { organizationId: org, isActive: true, id: { notIn: members.map((m) => m.memberRoleId!) } },
    });
    ruleId = (
      await prisma.approvalRule.create({
        data: { organizationId: org, kind: 'expense', secondRoleId: role.id, isActive: true, createdById: owner.id },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.approvalStep.deleteMany({ where: { itemId: { startsWith: tag } } });
    if (ruleId) await prisma.approvalRule.delete({ where: { id: ruleId } });
    await prisma.$disconnect();
  });

  it('two first approvals at the same instant open ONE step', async () => {
    const item = { organizationId: org, kind: 'expense' as const, itemId: `${tag}-a`, facts: { spaceIds: [] } };
    const results = await Promise.allSettled(
      people.map((deciderId) => svc.decide({ ...item, deciderId }, async () => 'written')),
    );
    const open = await prisma.approvalStep.count({ where: { itemId: item.itemId, consumedAt: null } });
    expect(open).toBe(1);
    // One went first (waiting); the other was judged as the next approval — never a second step 1, never written.
    expect(results.filter((r) => r.status === 'fulfilled' && 'waiting' in (r.value as object))).toHaveLength(1);
    expect(results.some((r) => r.status === 'fulfilled' && (r.value as { done?: string }).done === 'written')).toBe(
      false,
    );
  });

  it('a batch opened twice (a retry) leaves one step per item, no error', async () => {
    const items = [1, 2, 3].map((n) => ({ itemId: `${tag}-b${n}`, facts: { spaceIds: [] } }));
    const input = { organizationId: org, kind: 'expense' as const, deciderId: people[0] };
    await svc.firstOfMany(input, items);
    await svc.firstOfMany(input, items);
    const open = await prisma.approvalStep.count({ where: { itemId: { startsWith: `${tag}-b` }, consumedAt: null } });
    expect(open).toBe(3);
  });
});
