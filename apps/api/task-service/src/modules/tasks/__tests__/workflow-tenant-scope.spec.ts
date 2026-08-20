import { BadRequestException } from '@nestjs/common';
import { assertWorkflowInOrg, assertSpaceInOrg, assertUsersInOrg } from '../../../common/tenant-scope.util';

/**
 * An id from a client says nothing about whose it is.
 *
 * Task creation used a client-supplied workflowId without asking, and the
 * status lookup that followed filtered on the id alone — so passing another
 * tenant's workflow created a task running on THEIR state machine, inside this
 * organization. The recurring-task service had these checks already; creation
 * never adopted them, which is why they now live in one place.
 */
describe('tenant scope — an id must belong to the organization it claims', () => {
  const ORG = 'org-mine';
  const OTHER = 'org-theirs';

  /** Rows exist; the query decides which are visible for a given org. */
  const rows = {
    statusWorkflow: [
      { id: 'wf-mine', organizationId: ORG },
      { id: 'wf-theirs', organizationId: OTHER },
    ],
    companyLocation: [
      { id: 'sp-mine', organizationId: ORG },
      { id: 'sp-theirs', organizationId: OTHER },
    ],
    user: [
      { id: 'u-mine', organizationId: ORG },
      { id: 'u-theirs', organizationId: OTHER },
    ],
  };

  const prisma: any = {
    statusWorkflow: {
      findFirst: async ({ where }: any) =>
        rows.statusWorkflow.find((r) => r.id === where.id && r.organizationId === where.organizationId) ?? null,
    },
    companyLocation: {
      findFirst: async ({ where }: any) =>
        rows.companyLocation.find((r) => r.id === where.id && r.organizationId === where.organizationId) ?? null,
    },
    user: {
      findMany: async ({ where }: any) =>
        rows.user.filter((r) => where.id.in.includes(r.id) && r.organizationId === where.organizationId),
    },
  };

  describe('assertWorkflowInOrg', () => {
    it('accepts a workflow this organization owns', async () => {
      await expect(assertWorkflowInOrg(prisma, 'wf-mine', ORG)).resolves.toBeUndefined();
    });

    it("refuses another tenant's workflow — the hole this closes", async () => {
      await expect(assertWorkflowInOrg(prisma, 'wf-theirs', ORG)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses an id that exists nowhere', async () => {
      await expect(assertWorkflowInOrg(prisma, 'wf-invented', ORG)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('says the same thing either way, so it cannot be used to probe', async () => {
      // "Not yours" and "does not exist" must be indistinguishable, or the
      // error confirms the existence of another tenant's row.
      const foreign = await assertWorkflowInOrg(prisma, 'wf-theirs', ORG).catch((e) => e.message);
      const missing = await assertWorkflowInOrg(prisma, 'wf-invented', ORG).catch((e) => e.message);
      expect(foreign).toBe(missing);
    });

    it('passes through when no workflow was chosen — the flow is optional', async () => {
      await expect(assertWorkflowInOrg(prisma, null, ORG)).resolves.toBeUndefined();
      await expect(assertWorkflowInOrg(prisma, undefined, ORG)).resolves.toBeUndefined();
    });

    it('checks against the org given, which is not always the caller\'s', async () => {
      // A task in a cross-org shared space belongs to the space's OWNER, so its
      // workflow must be the owner's — checking the caller's org would be wrong.
      await expect(assertWorkflowInOrg(prisma, 'wf-theirs', OTHER)).resolves.toBeUndefined();
    });
  });

  describe('assertSpaceInOrg', () => {
    it('accepts our own space and refuses another tenant\'s', async () => {
      await expect(assertSpaceInOrg(prisma, 'sp-mine', ORG)).resolves.toBeUndefined();
      await expect(assertSpaceInOrg(prisma, 'sp-theirs', ORG)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('assertUsersInOrg', () => {
    it('accepts members of this organization', async () => {
      await expect(assertUsersInOrg(prisma, ['u-mine'], ORG)).resolves.toBeUndefined();
    });

    it('refuses when ANY id is foreign, not just when all are', async () => {
      // An assignment is itself a grant — task access short-circuits on "is this
      // person assigned?" before comparing organizations.
      await expect(assertUsersInOrg(prisma, ['u-mine', 'u-theirs'], ORG)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('tolerates duplicates rather than miscounting them as missing', async () => {
      await expect(assertUsersInOrg(prisma, ['u-mine', 'u-mine'], ORG)).resolves.toBeUndefined();
    });

    it('passes through on an empty list', async () => {
      await expect(assertUsersInOrg(prisma, [], ORG)).resolves.toBeUndefined();
      await expect(assertUsersInOrg(prisma, undefined, ORG)).resolves.toBeUndefined();
    });
  });
});
