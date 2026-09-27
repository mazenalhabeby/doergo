import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WorkflowsService } from '../workflows.service';

/**
 * A step's form is saved through the workflow editor's own routes: judged in
 * full, versioned by the server (only when the fields change), clearable, and
 * copied with a fork.
 */
describe('WorkflowsService — step forms', () => {
  const ORG = 'o1';
  const FIELDS = [{ id: 'n', type: 'note', label: 'Notes', required: true }];

  let prisma: any;
  let cache: any;
  const svc = () => new WorkflowsService(prisma, cache);

  beforeEach(() => {
    cache = { invalidate: jest.fn() };
    prisma = {
      statusWorkflow: {
        findUnique: jest.fn().mockResolvedValue({ id: 'wf', organizationId: ORG }),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: any) => ({ id: 'wf-new', ...data })),
        updateMany: jest.fn(),
      },
      workflowStatus: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: any) => ({ id: 'st', ...data })),
        update: jest.fn(async ({ data }: any) => ({ id: 'st', ...data })),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
  });

  it('adds a step with a validated form at version 1, ignoring a client-sent version', async () => {
    await svc().addStatus({ workflowId: 'wf', organizationId: ORG, name: 'Visited', key: 'visited', form: { version: 42, fields: FIELDS } });
    expect(prisma.workflowStatus.create.mock.calls[0][0].data.form).toEqual({ version: 1, fields: FIELDS });
    expect(cache.invalidate).toHaveBeenCalledWith(ORG);
  });

  it('refuses a bad definition with a coded 400 and writes nothing', async () => {
    const err: any = await svc()
      .addStatus({ workflowId: 'wf', organizationId: ORG, name: 'X', key: 'X', form: { fields: [{ type: 'script', label: 'x' }] } })
      .catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'STEP_FORM_DEFINITION_INVALID', params: { errors: [{ index: 0, code: 'unknown_type' }] } });
    expect(prisma.workflowStatus.create).not.toHaveBeenCalled();
  });

  it('bumps the version only when the fields change', async () => {
    prisma.workflowStatus.findUnique.mockResolvedValue({ id: 'st', workflowId: 'wf', name: 'Visited', form: { version: 4, fields: FIELDS } });
    await svc().updateStatus({ workflowId: 'wf', statusId: 'st', organizationId: ORG, form: { fields: FIELDS } });
    expect(prisma.workflowStatus.update.mock.calls[0][0].data.form).toEqual({ version: 4, fields: FIELDS });

    await svc().updateStatus({ workflowId: 'wf', statusId: 'st', organizationId: ORG, form: { fields: [{ ...FIELDS[0], label: 'What happened' }] } });
    expect(prisma.workflowStatus.update.mock.calls[1][0].data.form.version).toBe(5);
  });

  it('leaves the form alone when not sent, and clears it on null', async () => {
    prisma.workflowStatus.findUnique.mockResolvedValue({ id: 'st', workflowId: 'wf', name: 'Visited', form: { version: 1, fields: FIELDS } });
    await svc().updateStatus({ workflowId: 'wf', statusId: 'st', organizationId: ORG, name: 'Visited' });
    expect('form' in prisma.workflowStatus.update.mock.calls[0][0].data).toBe(false);
    await svc().updateStatus({ workflowId: 'wf', statusId: 'st', organizationId: ORG, form: null });
    expect(prisma.workflowStatus.update.mock.calls[1][0].data.form).toBe(Prisma.DbNull);
  });

  it('a workflow created with statuses (a template copy) carries each form, and a bad one refuses the create', async () => {
    await svc().create({
      name: 'Sales', organizationId: ORG,
      statuses: [
        { name: 'Visited', key: 'VISITED', form: { fields: FIELDS } },
        { name: 'Done', key: 'DONE', isFinal: true },
      ],
    });
    const rows = prisma.statusWorkflow.create.mock.calls[0][0].data.statuses.create;
    expect(rows[0].form).toEqual({ version: 1, fields: FIELDS });
    expect('form' in rows[1]).toBe(false);

    await expect(
      svc().create({ name: 'Bad', organizationId: ORG, statuses: [{ name: 'X', key: 'X', form: { fields: [{ type: 'note' }] } }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.statusWorkflow.create).toHaveBeenCalledTimes(1);
  });
});
