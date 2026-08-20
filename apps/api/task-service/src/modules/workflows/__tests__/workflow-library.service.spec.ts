import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { WorkflowLibraryService } from '../workflow-library.service';

/**
 * The library is the only table in this system a tenant reads but does not own.
 *
 * That makes two things load-bearing, and neither is visible from the outside:
 * an unpublished template must be unreachable, and using one must COPY it. A
 * live reference would let a curator's edit rewrite the state machine under
 * tasks that are already moving through it — a task whose current status
 * stopped existing has no transition out, and nothing can repair that later.
 */
describe('WorkflowLibraryService', () => {
  const ORG = 'org-1';

  const sound = [
    { name: 'New', key: 'NEW', color: '#2563EB', position: 0, isFinal: false, isCanceled: false, transitions: ['DONE'], capabilities: [] },
    { name: 'Done', key: 'DONE', color: '#16A34A', position: 1, isFinal: true, isCanceled: false, transitions: [], capabilities: [] },
  ];
  // Nothing is final: work would enter and never leave.
  const unsound = [
    { name: 'A', key: 'A', position: 0, transitions: ['B'] },
    { name: 'B', key: 'B', position: 1, transitions: ['A'] },
  ];

  const templates = [
    { id: 'tpl-live', slug: 'live', name: 'Live', description: null, industry: null, icon: null, isPublished: true, isBuiltIn: false, definition: sound },
    { id: 'tpl-draft', slug: 'draft', name: 'Draft', description: null, industry: null, icon: null, isPublished: false, isBuiltIn: false, definition: sound },
    { id: 'tpl-broken', slug: 'broken', name: 'Broken', description: null, industry: null, icon: null, isPublished: true, isBuiltIn: false, definition: unsound },
    { id: 'tpl-builtin', slug: 'field-service', name: 'Built in', description: null, industry: null, icon: null, isPublished: true, isBuiltIn: true, definition: sound },
  ];

  let updates: any[];
  let deletes: string[];

  const prisma: any = {
    workflowTemplate: {
      findMany: async ({ where }: any) =>
        templates.filter((t) => (where?.isPublished === undefined ? true : t.isPublished === where.isPublished)),
      findFirst: async ({ where }: any) =>
        templates.find((t) => t.id === where.id && (where.isPublished === undefined || t.isPublished === where.isPublished)) ?? null,
      findUnique: async ({ where }: any) => templates.find((t) => t.id === where.id) ?? null,
      update: async ({ where, data }: any) => { updates.push({ id: where.id, ...data }); return { ...templates.find((t) => t.id === where.id), ...data }; },
      delete: async ({ where }: any) => { deletes.push(where.id); return {}; },
      create: async ({ data }: any) => ({ id: 'new', ...data }),
      createMany: async () => ({ count: 0 }),
    },
    organization: { findMany: async () => [] },
    statusWorkflow: { findFirst: async () => null, findUnique: async () => null },
  };

  let created: any[];
  let attached: any[];
  const workflows: any = {
    create: async (data: any) => { created.push(data); return { success: true, data: { id: 'wf-new', name: data.name } }; },
    attachSpaceWorkflow: async (data: any) => { attached.push(data); return { success: true, data: {} }; },
  };

  const svc = () => new WorkflowLibraryService(prisma, workflows);

  beforeEach(() => { created = []; attached = []; updates = []; deletes = []; });

  describe('what a tenant can see', () => {
    it('offers published templates only — a draft is not a choice being withheld, it is not a choice yet', async () => {
      const res: any = await svc().listTemplates({ organizationId: ORG });
      expect(res.data.map((t: any) => t.id)).not.toContain('tpl-draft');
    });

    it('hides a published template that is no longer sound, instead of failing when someone commits to it', async () => {
      const res: any = await svc().listTemplates({ organizationId: ORG });
      expect(res.data.map((t: any) => t.id)).not.toContain('tpl-broken');
      expect(res.data.map((t: any) => t.id)).toContain('tpl-live');
    });

    it('does not hand back the raw stored definition', async () => {
      const res: any = await svc().listTemplates({ organizationId: ORG });
      expect(res.data[0]).not.toHaveProperty('definition');
      expect(res.data[0].statuses).toHaveLength(2);
    });
  });

  describe('using a template', () => {
    it('copies the statuses from the template, never from the caller', async () => {
      await svc().useTemplate({ templateId: 'tpl-live', organizationId: ORG });
      expect(created).toHaveLength(1);
      expect(created[0].statuses.map((s: any) => s.key)).toEqual(['NEW', 'DONE']);
      expect(created[0].organizationId).toBe(ORG);
    });

    it('takes the template name unless the tenant supplies one', async () => {
      await svc().useTemplate({ templateId: 'tpl-live', organizationId: ORG });
      expect(created[0].name).toBe('Live');
      await svc().useTemplate({ templateId: 'tpl-live', organizationId: ORG, name: '  Our flow  ' });
      expect(created[1].name).toBe('Our flow');
    });

    it('refuses an unpublished template, and says the same as for one that does not exist', async () => {
      await expect(svc().useTemplate({ templateId: 'tpl-draft', organizationId: ORG })).rejects.toThrow(NotFoundException);
      await expect(svc().useTemplate({ templateId: 'nope', organizationId: ORG })).rejects.toThrow(NotFoundException);
      expect(created).toHaveLength(0);
    });

    it('refuses a template that would trap work, rather than creating it', async () => {
      await expect(svc().useTemplate({ templateId: 'tpl-broken', organizationId: ORG })).rejects.toThrow(BadRequestException);
      expect(created).toHaveLength(0);
    });

    it('offers the copy in the space it was added from, when one was named', async () => {
      await svc().useTemplate({ templateId: 'tpl-live', organizationId: ORG, spaceId: 'sp-1' });
      expect(attached).toEqual([{ spaceId: 'sp-1', workflowId: 'wf-new', organizationId: ORG, makeDefault: false }]);
    });

    it('FORKS into the space: the copy belongs to that space alone', async () => {
      // Otherwise a second space adding the same template would inherit the
      // first space's edits — which defeats the point of choosing per space.
      await svc().useTemplate({ templateId: 'tpl-live', organizationId: ORG, spaceId: 'sp-1' });
      expect(created[0].ownerSpaceId).toBe('sp-1');
    });

    it('takes it organization-wide when that is asked for, so several spaces share one definition', async () => {
      await svc().useTemplate({ templateId: 'tpl-live', organizationId: ORG, spaceId: 'sp-1', shareWithOrganization: true });
      expect(created[0].ownerSpaceId).toBeNull();
      // Still offered where it was added from — widening is not the same as
      // adding it somewhere else.
      expect(attached[0].spaceId).toBe('sp-1');
    });

    it('is organization-wide when taken from the organization screen', async () => {
      await svc().useTemplate({ templateId: 'tpl-live', organizationId: ORG });
      expect(created[0].ownerSpaceId).toBeNull();
    });

    it('does not attach anywhere when no space was named', async () => {
      await svc().useTemplate({ templateId: 'tpl-live', organizationId: ORG });
      expect(attached).toHaveLength(0);
    });

    it('lets the space refusal reach the caller instead of swallowing it', async () => {
      // The space may lack a module the template's steps need. Swallowing that
      // would leave a new task type stranded outside the space it was added from.
      const failing: any = { ...workflows, attachSpaceWorkflow: async () => { throw new BadRequestException('needs tracking'); } };
      const s = new WorkflowLibraryService(prisma, failing);
      await expect(s.useTemplate({ templateId: 'tpl-live', organizationId: ORG, spaceId: 'sp-1' })).rejects.toThrow('needs tracking');
    });
  });

  describe('curation', () => {
    it('refuses to publish a template that would trap work', async () => {
      await expect(svc().curateSetPublished({ id: 'tpl-broken', isPublished: false })).resolves.toBeTruthy();
      updates = [];
      await expect(svc().curateSetPublished({ id: 'tpl-broken', isPublished: true })).rejects.toThrow(BadRequestException);
      expect(updates).toHaveLength(0);
    });

    it('saves an unfinished draft — a template being written is not a template that is wrong', async () => {
      const res: any = await svc().curateUpsert({ name: 'Half done', statuses: [{ name: 'Only', key: 'ONLY' }] });
      expect(res.data.isPublished).toBe(false);
    });

    it('refuses to publish that same unfinished draft', async () => {
      await expect(svc().curateUpsert({ name: 'Half done', statuses: [{ name: 'Only', key: 'ONLY' }], isPublished: true }))
        .rejects.toThrow(BadRequestException);
    });

    it('stores a normalized definition, so a bad shape never reaches the table', async () => {
      const res: any = await svc().curateUpsert({
        name: 'Cleaned',
        statuses: [{ name: 'Go', key: 'go now', color: 'not-a-colour', capabilities: ['gps', 'nonsense'] }],
      });
      expect(res.data.definition[0]).toMatchObject({ key: 'GO_NOW', capabilities: ['gps'] });
      expect(res.data.definition[0].color).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    it('derives a slug from the name when none is given', async () => {
      const res: any = await svc().curateUpsert({ name: 'Waste Collection' });
      expect(res.data.slug).toBe('waste-collection');
    });

    it('unpublishes a built-in instead of deleting it, because seeding would bring it back', async () => {
      const res: any = await svc().curateDelete({ id: 'tpl-builtin' });
      expect(res.data).toEqual({ deleted: false, unpublished: true });
      expect(deletes).toHaveLength(0);
      expect(updates).toEqual([{ id: 'tpl-builtin', isPublished: false }]);
    });

    it('deletes one a curator wrote', async () => {
      const res: any = await svc().curateDelete({ id: 'tpl-live' });
      expect(res.data).toEqual({ deleted: true, unpublished: false });
      expect(deletes).toEqual(['tpl-live']);
    });

    it('brings an org workflow in unpublished, so a curator reads it before every tenant is offered it', async () => {
      const p: any = {
        ...prisma,
        statusWorkflow: { findUnique: async () => ({ name: 'Their flow', statuses: sound }) },
      };
      const res: any = await new WorkflowLibraryService(p, workflows).curateImportFromOrg({ workflowId: 'wf-1' });
      expect(res.data.isPublished).toBe(false);
      expect(res.data.name).toBe('Their flow');
    });
  });

  describe('submitting a task type to the library', () => {
    const withWorkflow = (statuses: any, extra: any = {}) => ({
      ...prisma,
      statusWorkflow: { findFirst: async () => ({ name: 'Our flow', statuses }) },
      workflowTemplate: { ...prisma.workflowTemplate, ...extra },
    });

    it('arrives unpublished — a curator reads it before any other org is offered it', async () => {
      let saved: any = null;
      const p = withWorkflow(sound, {
        findFirst: async () => null,
        findMany: async () => [],
        create: async ({ data }: any) => { saved = data; return { id: 'tpl-sub', ...data }; },
      });
      await new WorkflowLibraryService(p, workflows).submitToLibrary({ workflowId: 'wf-1', organizationId: ORG });
      expect(saved.isPublished).toBe(false);
      expect(saved.submittedByOrgId).toBe(ORG);
      expect(saved.submittedAt).toBeInstanceOf(Date);
    });

    it('refuses a flow that traps work, while the person who built it is still looking at it', async () => {
      const p = withWorkflow(unsound, { findFirst: async () => null, findMany: async () => [] });
      await expect(new WorkflowLibraryService(p, workflows).submitToLibrary({ workflowId: 'wf-1', organizationId: ORG }))
        .rejects.toThrow(BadRequestException);
    });

    it('updates the pending row instead of queueing a second copy of the same task type', async () => {
      let updated: any = null;
      const p = withWorkflow(sound, {
        findFirst: async () => ({ id: 'tpl-pending', isPublished: false }),
        update: async ({ where, data }: any) => { updated = { where, data }; return { id: where.id }; },
      });
      const res: any = await new WorkflowLibraryService(p, workflows).submitToLibrary({ workflowId: 'wf-1', organizationId: ORG });
      expect(res.data.resubmitted).toBe(true);
      expect(updated.where.id).toBe('tpl-pending');
    });

    it('refuses to silently rewrite a template every tenant is already being offered', async () => {
      const p = withWorkflow(sound, { findFirst: async () => ({ id: 'tpl-x', isPublished: true }) });
      await expect(new WorkflowLibraryService(p, workflows).submitToLibrary({ workflowId: 'wf-1', organizationId: ORG }))
        .rejects.toThrow(ConflictException);
    });

    it('finds a free slug when the obvious one is taken — submissions collide on common names', async () => {
      let saved: any = null;
      const p = withWorkflow(sound, {
        findFirst: async () => null,
        findMany: async () => [{ slug: 'our-flow' }, { slug: 'our-flow-2' }],
        create: async ({ data }: any) => { saved = data; return { id: 'x', ...data }; },
      });
      await new WorkflowLibraryService(p, workflows).submitToLibrary({ workflowId: 'wf-1', organizationId: ORG });
      expect(saved.slug).toBe('our-flow-3');
    });

    it('refuses a task type belonging to another organization', async () => {
      const p = { ...prisma, statusWorkflow: { findFirst: async () => null } };
      await expect(new WorkflowLibraryService(p, workflows).submitToLibrary({ workflowId: 'wf-theirs', organizationId: ORG }))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('what a curator sees', () => {
    it('never lets provenance reach a tenant', async () => {
      // A flow's step names are a business's process, and sometimes a person's
      // name. Who submitted it is the curator's business alone.
      const p = {
        ...prisma,
        workflowTemplate: {
          ...prisma.workflowTemplate,
          findMany: async ({ where }: any) =>
            (where?.isPublished === undefined ? templates : templates.filter((t) => t.isPublished))
              .map((t) => ({ ...t, submittedByOrgId: 'org-secret', submittedAt: new Date() })),
        },
      };
      const s = new WorkflowLibraryService(p, workflows);

      const tenant: any = await s.listTemplates({ organizationId: ORG });
      for (const row of tenant.data) {
        expect(row).not.toHaveProperty('submittedByOrgId');
        expect(row).not.toHaveProperty('sourceKey');
      }

      const curator: any = await s.curateList();
      expect(curator.data[0]).toHaveProperty('submittedByOrgId');
      expect(curator.data[0]).toHaveProperty('advice');
    });
  });
});
