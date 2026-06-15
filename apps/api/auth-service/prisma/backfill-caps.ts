/** One-off: populate workflow_statuses.capabilities from the shared per-status map. */
import { PrismaClient } from '@prisma/client';
import { getStatusCapabilities } from '@hbcfield/shared';

const prisma = new PrismaClient();

async function main() {
  const wfs = await prisma.statusWorkflow.findMany({ include: { statuses: true } });
  let n = 0;
  for (const wf of wfs) {
    for (const s of wf.statuses) {
      const caps = getStatusCapabilities(wf.name, s.key);
      await prisma.workflowStatus.update({ where: { id: s.id }, data: { capabilities: caps as string[] } });
      n++;
    }
  }
  console.log(`✓ backfilled ${n} statuses across ${wfs.length} workflows`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
