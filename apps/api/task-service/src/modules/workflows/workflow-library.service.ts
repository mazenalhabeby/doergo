import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  WORKFLOW_TEMPLATES,
  normalizeTemplateStatuses,
  validateWorkflow,
  workflowAdvice,
  success,
  TEMPLATE_LIMITS,
  type TemplateStatusShape,
} from '@hbcfield/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WorkflowsService } from './workflows.service';

/**
 * The task-type library.
 *
 * One table serving two audiences with opposite rights: the platform curates it,
 * every tenant reads it, and no tenant writes to it. The split lives in this
 * file's method names — `list…`/`useTemplate` are tenant-facing and only ever
 * see published rows; the `curate…` methods are reachable only through the
 * platform-staff guard.
 *
 * The important decision is that using a template COPIES it. See the model
 * comment in schema.prisma: a live reference would let a curator's edit rewrite
 * the state machine under tasks that are already moving through it.
 */
@Injectable()
export class WorkflowLibraryService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowLibraryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflows: WorkflowsService,
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
    } catch (err: any) {
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

    const created: any = await this.workflows.create({
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
      await this.workflows.attachSpaceWorkflow({
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
      select: {
        name: true,
        statuses: {
          orderBy: { position: 'asc' },
          select: {
            name: true, key: true, color: true, icon: true, position: true,
            isFinal: true, isCanceled: true, transitions: true, capabilities: true,
          },
        },
      },
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

  // ── Platform side (curation) ───────────────────────────────────────────────

  /**
   * Every template, published or not — with what is wrong with each, what could
   * be better, and who submitted it.
   *
   * Submissions surface here rather than in a queue of their own: reviewing one
   * IS curating, and a separate screen would be the same list with a filter.
   * They sort first because an unpublished row is the one waiting on somebody.
   */
  async curateList() {
    const rows = await this.prisma.workflowTemplate.findMany({
      orderBy: [{ isPublished: 'asc' }, { submittedAt: 'desc' }, { position: 'asc' }, { name: 'asc' }],
    });

    // One lookup for every submitting org, not one per row.
    const orgIds = [...new Set(rows.map((r) => r.submittedByOrgId).filter(Boolean))] as string[];
    const orgs = orgIds.length
      ? await this.prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })
      : [];
    const orgName = new Map(orgs.map((o) => [o.id, o.name]));

    return success(
      rows.map((r) => {
        const statuses = normalizeTemplateStatuses(r.definition);
        return {
          ...r,
          statuses,
          problems: validateWorkflow(statuses),
          advice: workflowAdvice(statuses),
          submittedByOrgName: r.submittedByOrgId ? orgName.get(r.submittedByOrgId) ?? null : null,
        };
      }),
    );
  }

  /**
   * Create or replace a template.
   *
   * The definition is normalized on the way IN as well as on the way out. Once
   * stored clean, every later read is cheap and the row cannot rot into a shape
   * the clone has to defend against — the defence stays, but it stops being the
   * only one.
   */
  async curateUpsert(data: {
    id?: string;
    slug?: string;
    name?: string;
    description?: string | null;
    industry?: string | null;
    icon?: string | null;
    position?: number;
    isPublished?: boolean;
    statuses?: unknown;
  }) {
    const name = (data.name ?? '').trim().slice(0, TEMPLATE_LIMITS.maxNameLength);
    const description = (data.description ?? '')?.trim().slice(0, TEMPLATE_LIMITS.maxDescriptionLength) || null;
    const industry = (data.industry ?? '')?.trim().slice(0, 40).toLowerCase() || null;
    const icon = (data.icon ?? '')?.trim().slice(0, 32) || null;
    const statuses = normalizeTemplateStatuses(data.statuses);

    if (!name) throw new BadRequestException('A template needs a name');

    /*
      Publishing is the gate, not saving.

      A template being written is legitimately unfinished — the same reason the
      tenant-side builder does not validate every edit. It becomes a problem the
      moment it is offered to tenants, so that is where the whole list of
      problems is refused at once.
    */
    if (data.isPublished) {
      const problems = validateWorkflow(statuses);
      if (problems.length > 0) {
        throw new BadRequestException(
          `Cannot publish: ${problems.map((p) => p.message).join(' ')}`,
        );
      }
    }

    if (data.id) {
      const existing = await this.prisma.workflowTemplate.findUnique({
        where: { id: data.id },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Template not found');

      const updated = await this.prisma.workflowTemplate.update({
        where: { id: data.id },
        data: {
          name,
          description,
          industry,
          icon,
          ...(Number.isFinite(data.position) ? { position: Number(data.position) } : {}),
          isPublished: data.isPublished === true,
          definition: statuses as unknown as object,
        },
      });
      return success(updated);
    }

    // A slug is an identity, so it is derived once and then fixed. Renaming a
    // template must not silently create a second one.
    const slug =
      (data.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') ||
      name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug) throw new BadRequestException('A template needs a slug');

    try {
      const createdRow = await this.prisma.workflowTemplate.create({
        data: {
          slug,
          name,
          description,
          industry,
          icon,
          position: Number.isFinite(data.position) ? Number(data.position) : 0,
          isPublished: data.isPublished === true,
          isBuiltIn: false,
          definition: statuses as unknown as object,
        },
      });
      return success(createdRow);
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictException(`A template with the slug "${slug}" already exists.`);
      throw err;
    }
  }

  /** Publish or unpublish, without going through the whole editor. */
  async curateSetPublished(data: { id: string; isPublished: boolean }) {
    const row = await this.prisma.workflowTemplate.findUnique({
      where: { id: data.id },
      select: { definition: true },
    });
    if (!row) throw new NotFoundException('Template not found');

    if (data.isPublished) {
      const problems = validateWorkflow(normalizeTemplateStatuses(row.definition));
      if (problems.length > 0) {
        throw new BadRequestException(`Cannot publish: ${problems.map((p) => p.message).join(' ')}`);
      }
    }

    const updated = await this.prisma.workflowTemplate.update({
      where: { id: data.id },
      data: { isPublished: data.isPublished },
    });
    return success(updated);
  }

  /**
   * Remove a template from the library.
   *
   * Safe by construction: tenants hold copies, not references, so nothing that
   * is already running is touched. A built-in would come back on the next boot
   * anyway, so it is unpublished instead of deleted — saying so rather than
   * appearing to work and then reappearing.
   */
  async curateDelete(data: { id: string }) {
    const row = await this.prisma.workflowTemplate.findUnique({
      where: { id: data.id },
      select: { isBuiltIn: true },
    });
    if (!row) throw new NotFoundException('Template not found');

    if (row.isBuiltIn) {
      await this.prisma.workflowTemplate.update({ where: { id: data.id }, data: { isPublished: false } });
      return success({ deleted: false, unpublished: true });
    }

    await this.prisma.workflowTemplate.delete({ where: { id: data.id } });
    return success({ deleted: true, unpublished: false });
  }

  /**
   * Take a copy of an organization's task type into the library.
   *
   * The plan's own advice: the best first templates are the workflows real orgs
   * already run. Copied, never linked — the tenant keeps theirs and edits to
   * either side stay on their own side of the line.
   */
  async curateImportFromOrg(data: { workflowId: string; slug?: string; industry?: string | null }) {
    const wf = await this.prisma.statusWorkflow.findUnique({
      where: { id: data.workflowId },
      select: {
        name: true,
        statuses: {
          orderBy: { position: 'asc' },
          select: {
            name: true, key: true, color: true, icon: true, position: true,
            isFinal: true, isCanceled: true, transitions: true, capabilities: true,
          },
        },
      },
    });
    if (!wf) throw new NotFoundException('Task type not found');

    return this.curateUpsert({
      slug: data.slug ?? '',
      name: wf.name,
      industry: data.industry ?? null,
      // Imported unpublished on purpose: a real org's workflow may carry names
      // or steps specific to them, and a curator should read it before every
      // tenant is offered it.
      isPublished: false,
      statuses: wf.statuses as unknown as TemplateStatusShape[],
    });
  }
}
