import { DEFAULT_WORKFLOW_TEMPLATE } from '@hbcfield/shared';

/**
 * Minimal shape of the Prisma client (or a transaction client) needed to seed a
 * workflow — kept structural so it works with `prisma` and `tx` alike.
 */
type WorkflowSeedClient = {
  statusWorkflow: {
    create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
  };
};

/**
 * Seed a brand-new organization with its default task type (Field Service),
 * so the org starts with a usable, capability-rich flow instead of an empty
 * Task Types screen.
 *
 * The definition lives in `@hbcfield/shared` (`DEFAULT_WORKFLOW_TEMPLATE`) —
 * the same constant task-service seeds into the shared LIBRARY at boot, so
 * "Field Service" means one thing whether an org is given it or picks it.
 * Bootstrapping cannot read the library: an organization is created before
 * anyone could choose from it.
 */
export async function seedDefaultWorkflow(
  client: WorkflowSeedClient,
  organizationId: string,
): Promise<void> {
  const t = DEFAULT_WORKFLOW_TEMPLATE;
  await client.statusWorkflow.create({
    data: {
      name: t.name,
      isDefault: true,
      organizationId,
      statuses: {
        create: t.statuses.map((s) => ({
          name: s.name,
          key: s.key,
          color: s.color,
          icon: s.icon,
          position: s.position,
          isFinal: s.isFinal,
          isCanceled: s.isCanceled,
          transitions: s.transitions,
          capabilities: s.capabilities,
        })),
      },
    },
  });
}
