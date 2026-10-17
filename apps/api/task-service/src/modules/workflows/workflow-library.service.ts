import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  WORKFLOW_TEMPLATES,
  normalizeTemplateStatuses,
  validateWorkflow,
  success,
  TEMPLATE_LIMITS,
} from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WorkflowsService } from './workflows.service';
import { SpaceWorkflowsService } from './space-workflows.service';
import { TEMPLATE_SOURCE_SELECT } from './workflow-library-helpers';

@Injectable()
export class WorkflowLibraryService {
  private readonly logger = new Logger(WorkflowLibraryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflows: WorkflowsService,
    private readonly spaceWorkflows: SpaceWorkflowsService,
  ) {}

  /**
   * Put the shipped templates in the library, once.
   *
   * They already existed in code (`WORKFLOW_TEMPLATES`), where they seed a new
   * organization's first task type. Copying them in at boot means the library
   * has content on day one and there is still only one definition of "Field
   * Service" in the codebase.
   *
   * `skipDuplicates` on the unique slug does the whole job: re-running is a
   * no-op, two replicas starting together is a no-op, and — the point — a
   * curator's edits are never overwritten by a later deploy. Once a template is
   * in the library it is curated data, not code.
   */
  async onModuleInit(): Promise<void> {
    try {
      const result = await this.prisma.workflowTemplate.createMany({
        data: WORKFLOW_TEMPLATES.map((tpl, i) => ({
          slug: tpl.id,
          name: tpl.name,
          description: tpl.description,
          industry: tpl.id,
          position: i,
          isPublished: true,
          isBuiltIn: true,
          definition: tpl.statuses as unknown as object,
        })),
        skipDuplicates: true,
      });
      if (result.count > 0) {
        this.logger.log(`Seeded ${result.count} built-in task-type template(s) into the library`);
      }
    } catch (err) {
      // A library with nothing in it is a smaller problem than a service that
      // will not start: every other path still works, and "New task type" simply
      // offers nothing to start from.
      this.logger.warn(`Could not seed built-in templates: ${err?.message ?? err}`);
    }
  }

  // ── Tenant side (read-only) ────────────────────────────────────────────────

  /**
   * The library as a tenant sees it: published rows, normalized, sound ones only.
   *
   * Unpublished rows are invisible rather than disabled — a half-written
   * template is not a choice being withheld, it is not a choice yet. The
   * validity filter is the second belt: publishing already refuses an unsound
   * template, and this makes a row that became unsound later (an edit, an older
   * shape) drop out of the picker instead of failing at the moment someone
   * commits to it.
   */
  async listTemplates(_data: { organizationId: string }) {
    const rows = await this.prisma.workflowTemplate.findMany({
      where: { isPublished: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        industry: true,
        icon: true,
        definition: true,
      },
    });

    /*
      Built field by field, not spread.

      What a tenant may see is a security property, and a `...row` spread puts
      that property in the `select` above rather than here — so the day someone
      adds a column to that select for an unrelated reason, it ships to every
      tenant silently. Provenance is exactly such a column: who submitted a
      template is the curator's business, because a flow's step names are a
      business's process and sometimes a person's name.
    */
    const usable = rows
      .map((r) => ({ ...r, statuses: normalizeTemplateStatuses(r.definition) }))
      .filter((r) => validateWorkflow(r.statuses).length === 0)
      .map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        description: r.description,
        industry: r.industry,
        icon: r.icon,
        statuses: r.statuses,
      }));

    return success(usable);
  }

  /**
   * Copy a template into this organization as a new task type.
   *
   * Everything the tenant supplies is an id and a name; the STATUSES come from
   * the library row and never from the request, so the shape of a new workflow
   * is not something a client can dictate. Creation itself goes through
   * `WorkflowsService.create` rather than writing rows here — the duplicate-name
   * check, the default handling and the cache invalidation are already there,
   * and a second copy of them would be the one that drifts.
   */
  async useTemplate(data: {
    templateId: string;
    organizationId: string;
    name?: string;
    isDefault?: boolean;
    /**
     * Fork it into this space: the copy belongs to the space, only that space
     * offers it, and editing it there affects nobody else. This is the default
     * route, because it is what "I want this flow here" means.
     */
    spaceId?: string;
    /**
     * Take the copy at organization level instead, so several spaces can offer
     * the one definition and a typo is fixed once. A deliberate widening.
     */
    shareWithOrganization?: boolean;
  }) {
    const template = await this.prisma.workflowTemplate.findFirst({
      where: { id: data.templateId, isPublished: true },
      select: { name: true, definition: true },
    });
    // Unpublished and non-existent answer alike: an unpublished template is not
    // a tenant's business either way.
    if (!template) throw new NotFoundException('Template not found');

    const statuses = normalizeTemplateStatuses(template.definition);
    const problems = validateWorkflow(statuses);
    if (problems.length > 0) {
      // The tenant did nothing wrong here, so the message says so rather than
      // reading as a validation failure on their input.
      throw new BadRequestException(
        `This template is not usable right now: ${problems.map((p) => p.message).join(' ')}`,
      );
    }

    /*
      Forked, not referenced — and forked INTO the space by default.

      The copy is the tenant's from here on: editing it cannot reach the library
      row, and the library row cannot reach it. Scoping it to the space means a
      second space adding the same template gets its own copy rather than
      inheriting the first space's edits, which is the whole point of choosing
      per space.
    */
    const ownerSpaceId = data.spaceId && !data.shareWithOrganization ? data.spaceId : null;

    const created = await this.workflows.create({
      name: (data.name ?? '').trim() || template.name,
      isDefault: data.isDefault === true,
      organizationId: data.organizationId,
      ownerSpaceId,
      statuses,
    });
    const workflow = created?.data;

    /*
      Attaching is part of the same intent when it came from a space's own
      screen: nobody adds a task type from there and means "but not here".
      It can still be refused — the space may not have a module the template's
      steps need — and that refusal must reach the caller rather than being
      swallowed, or they would be left with a type that silently is not offered
      where they added it.
    */
    if (data.spaceId && workflow?.id) {
      await this.spaceWorkflows.attachSpaceWorkflow({
        spaceId: data.spaceId,
        workflowId: workflow.id,
        organizationId: data.organizationId,
        makeDefault: false,
      });
    }

    return success(workflow);
  }

  /**
   * Offer one of this organization's task types to the shared library.
   *
   * It does NOT publish. A workflow's step names are a business's process, and
   * often a customer's or a person's name — "Await Siemens sign-off" is not
   * something to broadcast to every other tenant because somebody clicked a
   * button. So a submission arrives as an unpublished row for a curator to read,
   * and publishing is their act.
   *
   * Provenance is stored for the curator alone. `listTemplates` selects named
   * fields and never includes it, so a published template carries no trace of
   * who wrote it.
   */
  async submitToLibrary(data: { workflowId: string; organizationId: string; note?: string }) {
    const wf = await this.prisma.statusWorkflow.findFirst({
      where: { id: data.workflowId, organizationId: data.organizationId },
      select: TEMPLATE_SOURCE_SELECT,
    });
    if (!wf) throw new NotFoundException('Task type not found');

    const statuses = normalizeTemplateStatuses(wf.statuses);
    /*
      Refused here rather than at review, so the answer arrives while the person
      who built it is still looking at it. A curator's queue is also not the
      place to discover a flow that traps work.
    */
    const problems = validateWorkflow(statuses);
    if (problems.length > 0) {
      throw new BadRequestException(
        `Finish this task type before offering it to others: ${problems.map((p) => p.message).join(' ')}`,
      );
    }

    // One pending submission per workflow: re-submitting updates the row a
    // curator may already be reading, rather than queueing a second copy of it.
    const existing = await this.prisma.workflowTemplate.findFirst({
      where: { sourceKey: `${data.organizationId}:${data.workflowId}` },
      select: { id: true, isPublished: true },
    });
    if (existing?.isPublished) {
      // Already in the library. Re-submitting must not silently rewrite what
      // every tenant is being offered.
      throw new ConflictException('This task type is already in the library. Ask support to update it.');
    }

    const description = (data.note ?? '').trim().slice(0, TEMPLATE_LIMITS.maxDescriptionLength) || null;

    if (existing) {
      const updated = await this.prisma.workflowTemplate.update({
        where: { id: existing.id },
        data: { name: wf.name, description, definition: statuses as unknown as object, submittedAt: new Date() },
      });
      return success({ id: updated.id, resubmitted: true });
    }

    const slug = await this.uniqueSlug(wf.name);
    const row = await this.prisma.workflowTemplate.create({
      data: {
        slug,
        name: wf.name,
        description,
        isPublished: false,
        isBuiltIn: false,
        submittedByOrgId: data.organizationId,
        submittedAt: new Date(),
        sourceKey: `${data.organizationId}:${data.workflowId}`,
        definition: statuses as unknown as object,
      },
    });
    return success({ id: row.id, resubmitted: false });
  }

  /** A slug nothing else holds. Submissions collide on common names constantly. */
  private async uniqueSlug(name: string): Promise<string> {
    const base =
      name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'task-type';
    const taken = await this.prisma.workflowTemplate.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    });
    const used = new Set(taken.map((t) => t.slug));
    if (!used.has(base)) return base;
    for (let i = 2; i < 500; i++) {
      const candidate = `${base}-${i}`;
      if (!used.has(candidate)) return candidate;
    }
    // Astronomically unlikely; still better than a unique-constraint stack trace.
    throw new ConflictException('Could not find a free name for this template.');
  }
}
