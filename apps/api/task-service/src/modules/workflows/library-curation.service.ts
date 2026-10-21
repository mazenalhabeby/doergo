import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  normalizeTemplateStatuses,
  validateWorkflow,
  workflowAdvice,
  success,
  TEMPLATE_LIMITS,
  type TemplateStatusShape,
} from '@hbcfield/shared';
import { PrismaService } from '@hbcfield/shared';
import { TEMPLATE_SOURCE_SELECT } from './workflow-library-helpers';

/**
 * The platform's curation of the template library: list, add or change, publish,
 * delete, import an organization's workflow.
 */
@Injectable()
export class LibraryCurationService {

  constructor(private readonly prisma: PrismaService) {}

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
          submittedByOrgName: r.submittedByOrgId ? (orgName.get(r.submittedByOrgId) ?? null) : null,
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
        throw new BadRequestException(`Cannot publish: ${problems.map((p) => p.message).join(' ')}`);
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
    } catch (err) {
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
      select: TEMPLATE_SOURCE_SELECT,
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
