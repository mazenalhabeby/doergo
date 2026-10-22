import { orgModules } from '@hbcfield/shared';
import type { Logger } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import type { PrismaService } from '@hbcfield/shared';
import { crmIntents, type PreparedStepSubmission } from './step-submission';
import { sendRpc, addCustomerActivity } from '@hbcfield/shared/microservices';

/**
 * A step form's CRM fields, written to the job's client — through the SAME
 * service path a member uses (`add_customer_activity`), as the member who
 * moved the job, so the CRM's own reach and work rules decide. Only when the
 * job's workspace (else the organization) runs CRM.
 *
 * ⚠️ Best-effort by design: the move and its answers are already committed.
 * A client the mover cannot reach, CRM being off, or auth-service being down
 * is logged and passed over — never a reason to refuse the move after the fact.
 */
export async function applyStepFormCrm(
  deps: { prisma: PrismaService; authClient?: ClientProxy; logger: Logger },
  args: {
    submissionId: string;
    submission: PreparedStepSubmission;
    task: {
      title: string;
      customerId: string;
      spaceId: string | null;
      organizationId: string;
      timezone: string | null;
    };
    userId: string;
    userRole: string;
  },
): Promise<void> {
  try {
    const intents = crmIntents({
      submissionId: args.submissionId,
      form: args.submission.form,
      answers: args.submission.answers,
      taskTitle: args.task.title,
      moverId: args.userId,
      timezone: args.task.timezone,
    });
    if (!intents.length || !deps.authClient) return;
    if (!(await runsCrm(deps.prisma, args.task.spaceId, args.task.organizationId))) return;
    for (const intent of intents) {
      try {
        await firstValueFrom(
          sendRpc(deps.authClient, addCustomerActivity, {
            ...intent,
            customerId: args.task.customerId,
            organizationId: args.task.organizationId,
            authorId: args.userId,
            caller: { userId: args.userId, role: args.userRole },
          }).pipe(timeout(5000)),
        );
      } catch (err) {
        deps.logger.warn(
          `Step form CRM ${intent.type} skipped for submission ${args.submissionId}: ${err?.message ?? err}`,
        );
      }
    }
  } catch (err) {
    deps.logger.warn(`Step form CRM failed for submission ${args.submissionId}: ${err?.message ?? err}`);
  }
}

/** Does the job's workspace (else its organization) run the CRM module? */
async function runsCrm(prisma: PrismaService, spaceId: string | null, organizationId: string): Promise<boolean> {
  if (spaceId) {
    const space = await prisma.companyLocation.findFirst({
      where: { id: spaceId, organizationId },
      select: { enabledModules: true, organization: { select: { enabledModules: true } } },
    });
    if (space) {
      const mods =
        (space.enabledModules as string[] | null) ?? (space.organization?.enabledModules as string[] | null) ?? [];
      return mods.includes('crm');
    }
  }
  const org = await orgModules(prisma, organizationId);
  return ((org?.enabledModules as string[] | null) ?? []).includes('crm');
}
