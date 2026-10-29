import { personName, signMailDue, type PrismaService, type SignMailDue } from '@hbcfield/shared';
import { CLIENT_STEP_WHERE } from '../common/actor';

/** One client step whose turn it is, as the signing email needs it. */
export interface WaitingStep {
  id: string;
  title: string;
  forMember: string | null;
  customerId: string | null;
  organizationName: string;
  due: SignMailDue;
}

/**
 * What is genuinely this client's turn at one address — the list the email
 * names, and what each step is owed by the sweep (first email, a reminder, or
 * nothing).
 *
 * Only CLIENT steps: a member's step carries their address too, and the public
 * link must never become a way to sign a staff step.
 */
export async function clientStepsWaiting(
  prisma: PrismaService,
  organizationId: string,
  email: string,
  now: Date = new Date(),
): Promise<WaitingStep[]> {
  const rows = await prisma.documentSigner.findMany({
    where: {
      email,
      status: 'PENDING',
      ...CLIENT_STEP_WHERE,
      document: { organizationId, status: 'AWAITING_SIGNATURE' },
    },
    select: {
      id: true,
      order: true,
      customerId: true,
      linkMailedAt: true,
      linkReminders: true,
      document: {
        select: {
          title: true,
          user: { select: { firstName: true, lastName: true } },
          organization: { select: { name: true } },
          signers: { select: { order: true, status: true } },
        },
      },
    },
    orderBy: { document: { issuedAt: 'asc' } },
    take: 50,
  });

  // Only steps whose turn it actually is. A document three signatures away is
  // not theirs yet, and naming it in an email invites a countersignature on
  // work the supplier has not finished approving.
  return rows
    .filter((r) => {
      const pending = r.document.signers.filter((s) => s.status === 'PENDING').sort((a, b) => a.order - b.order);
      return pending[0]?.order === r.order;
    })
    .map((r) => ({
      id: r.id,
      title: r.document.title,
      forMember: r.document.user ? personName(r.document.user) : null,
      customerId: r.customerId,
      organizationName: r.document.organization?.name ?? '',
      due: signMailDue(r, now),
    }));
}

/** After an email went out: each step's first email or reminder is recorded, so the sweep never repeats it. */
export async function recordStepsMailed(prisma: PrismaService, steps: WaitingStep[], now: Date = new Date()) {
  const first = steps.filter((s) => s.due === 'FIRST').map((s) => s.id);
  const reminded = steps.filter((s) => s.due === 'REMINDER').map((s) => s.id);
  if (first.length) {
    await prisma.documentSigner.updateMany({
      where: { id: { in: first }, linkMailedAt: null },
      data: { linkMailedAt: now },
    });
  }
  if (reminded.length) {
    await prisma.documentSigner.updateMany({
      where: { id: { in: reminded } },
      data: { linkReminders: { increment: 1 } },
    });
  }
}
