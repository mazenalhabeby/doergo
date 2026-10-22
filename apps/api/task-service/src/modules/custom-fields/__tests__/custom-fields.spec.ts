import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CustomFieldsService } from '../custom-fields.service';
import { CustomFieldValuesService } from '../custom-field-values.service';

/**
 * A custom field is defined once for the organization (global) or for one task
 * type, and a task shows exactly the fields of its type plus the global ones.
 * Every value is checked against its field's type before anything is written.
 * (Who may read/write a task's values is the task gate — task-access-service.spec.)
 */
const ORG = 'org-1';
const caller = { organizationId: ORG, userId: 'u1', userRole: 'ADMIN' };

function setup() {
  const prisma: any = {
    customFieldDefinition: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: any) => ({ id: 'd-new', ...data })),
      update: jest.fn(async ({ data }: any) => data),
      delete: jest.fn(),
    },
    customFieldValue: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn((args: any) => args),
    },
    statusWorkflow: { findFirst: jest.fn().mockResolvedValue({ id: 'wf-1' }) },
    task: { findUnique: jest.fn().mockResolvedValue({ id: 't1', organizationId: ORG, workflowId: 'wf-1' }) },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  };
  const taskAccess: any = { assert: jest.fn() };
  return {
    prisma,
    taskAccess,
    fields: new CustomFieldsService(prisma, taskAccess),
    values: new CustomFieldValuesService(prisma, taskAccess),
  };
}

describe('custom field definitions', () => {
  it('lists by scope: everything, the global ones, or a task type plus the global ones', async () => {
    const { prisma, fields } = setup();
    await fields.findAll({ organizationId: ORG });
    await fields.findAll({ organizationId: ORG, forWorkflow: '__none__' });
    await fields.findAll({ organizationId: ORG, forWorkflow: 'wf-1' });
    const wheres = prisma.customFieldDefinition.findMany.mock.calls.map((c: any) => c[0].where);
    expect(wheres).toEqual([
      { organizationId: ORG },
      { organizationId: ORG, isActive: true, workflowId: null },
      { organizationId: ORG, isActive: true, OR: [{ workflowId: 'wf-1' }, { workflowId: null }] },
    ]);
  });

  it('a dropdown needs at least one option', async () => {
    const { prisma, fields } = setup();
    for (const options of [undefined, [], 'a,b']) {
      await expect(
        fields.create({ name: 'Size', key: 'size', type: 'DROPDOWN', options, organizationId: ORG }),
      ).rejects.toThrow(BadRequestException);
    }
    expect(prisma.customFieldDefinition.create).not.toHaveBeenCalled();
  });

  it("a task type must be this organization's", async () => {
    const { prisma, fields } = setup();
    prisma.statusWorkflow.findFirst.mockResolvedValueOnce(null);
    await expect(
      fields.create({ name: 'X', key: 'x', type: 'TEXT', workflowId: 'theirs', organizationId: ORG }),
    ).rejects.toThrow('Task Type not found');
    expect(prisma.statusWorkflow.findFirst.mock.calls[0][0].where).toEqual({ id: 'theirs', organizationId: ORG });
  });

  it('the key is lower-cased with underscores, and goes last in its own scope', async () => {
    const { prisma, fields } = setup();
    prisma.customFieldDefinition.findFirst.mockResolvedValueOnce({ position: 6 });
    await fields.create({
      name: 'Serial No',
      key: 'Serial  No',
      type: 'TEXT',
      workflowId: 'wf-1',
      organizationId: ORG,
    });
    expect(prisma.customFieldDefinition.findFirst.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      workflowId: 'wf-1',
    });
    expect(prisma.customFieldDefinition.create.mock.calls[0][0].data).toMatchObject({
      key: 'serial_no',
      position: 7,
      isRequired: false,
      workflowId: 'wf-1',
    });
  });

  it('two names that become the same key in one scope are a friendly 409, not a database error', async () => {
    const { prisma, fields } = setup();
    prisma.customFieldDefinition.findFirst
      .mockResolvedValueOnce(null) // position
      .mockResolvedValueOnce({ id: 'existing' }); // duplicate
    await expect(
      fields.create({ name: 'Serial no', key: 'serial no', type: 'TEXT', organizationId: ORG }),
    ).rejects.toThrow(new ConflictException('A field named "Serial no" already exists.'));

    // The race the pre-check cannot see: the unique index answers, still as a 409.
    prisma.customFieldDefinition.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(
      fields.create({ name: 'Serial', key: 'serial', type: 'TEXT', workflowId: 'wf-1', organizationId: ORG }),
    ).rejects.toThrow('already exists for this task type');
  });

  it('an update writes only what was sent; another organization answers 404', async () => {
    const { prisma, fields } = setup();
    prisma.customFieldDefinition.findUnique.mockResolvedValueOnce({ id: 'd1', organizationId: ORG });
    await fields.update({ id: 'd1', organizationId: ORG, isActive: false });
    expect(prisma.customFieldDefinition.update.mock.calls[0][0].data).toEqual({ isActive: false });

    prisma.customFieldDefinition.findUnique.mockResolvedValueOnce({ id: 'd1', organizationId: 'org-2' });
    await expect(fields.remove({ id: 'd1', organizationId: ORG })).rejects.toThrow(NotFoundException);
    expect(prisma.customFieldDefinition.delete).not.toHaveBeenCalled();
  });
});

describe("a task's values", () => {
  it('one row per field of its type and the global ones, empty where unset', async () => {
    const { prisma, fields, taskAccess } = setup();
    prisma.customFieldDefinition.findMany.mockResolvedValueOnce([{ id: 'd1' }, { id: 'd2' }]);
    prisma.customFieldValue.findMany.mockResolvedValueOnce([{ id: 'v2', definitionId: 'd2', value: '42' }]);
    const res: any = await fields.getTaskValues({ ...caller, taskId: 't1' });

    expect(taskAccess.assert.mock.calls[0][2]).toEqual({ roleHolderMayRead: true });
    expect(prisma.customFieldDefinition.findMany.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      isActive: true,
      OR: [{ workflowId: 'wf-1' }, { workflowId: null }],
    });
    expect(res.data.map((r: any) => [r.id, r.value])).toEqual([
      ['unset-d1', ''],
      ['v2', '42'],
    ]);
  });

  it('a task with no type shows only the global fields', async () => {
    const { prisma, fields } = setup();
    prisma.task.findUnique.mockResolvedValueOnce({ id: 't1', organizationId: ORG, workflowId: null });
    await fields.getTaskValues({ ...caller, taskId: 't1' });
    expect(prisma.customFieldDefinition.findMany.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      isActive: true,
      workflowId: null,
    });
  });

  it("another organization's task is 404 before the gate is even asked", async () => {
    const { prisma, fields, taskAccess } = setup();
    prisma.task.findUnique.mockResolvedValueOnce({ id: 't1', organizationId: 'org-2' });
    await expect(fields.getTaskValues({ ...caller, taskId: 't1' })).rejects.toThrow(NotFoundException);
    expect(taskAccess.assert).not.toHaveBeenCalled();
  });

  it('writing asks the full task gate — never the read-only exemption', async () => {
    const { prisma, values, taskAccess } = setup();
    prisma.customFieldDefinition.findMany.mockResolvedValueOnce([{ id: 'd1', type: 'TEXT', name: 'Note' }]);
    await values.setTaskValues({ ...caller, taskId: 't1', values: [{ definitionId: 'd1', value: 'hi' }] });
    expect(taskAccess.assert.mock.calls[0]).toHaveLength(2);
    expect(prisma.customFieldValue.upsert.mock.calls[0][0].where).toEqual({
      definitionId_taskId: { definitionId: 'd1', taskId: 't1' },
    });
  });

  it('a field of another organization refuses the whole batch', async () => {
    const { prisma, values } = setup();
    prisma.customFieldDefinition.findMany.mockResolvedValueOnce([{ id: 'd1', type: 'TEXT', name: 'Note' }]);
    await expect(
      values.setTaskValues({
        ...caller,
        taskId: 't1',
        values: [
          { definitionId: 'd1', value: 'a' },
          { definitionId: 'theirs', value: 'b' },
        ],
      }),
    ).rejects.toThrow('not found in this organization');
    expect(prisma.customFieldDefinition.findMany.mock.calls[0][0].where.organizationId).toBe(ORG);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['NUMBER', 'twelve', '12.5'],
    ['DATE', 'tomorrow', '2026-10-22'],
    ['CHECKBOX', 'yes', 'false'],
    ['DROPDOWN', 'XL', 'M'],
    ['EMAIL', 'anna@', 'anna@example.com'],
    ['URL', 'javascript:alert(1)', 'https://example.com/x'],
  ])('%s: refuses %p, accepts %p', async (type, bad, good) => {
    const { prisma, values } = setup();
    const def = { id: 'd1', type, name: 'F', options: ['S', 'M', 'L'] };
    prisma.customFieldDefinition.findMany.mockResolvedValue([def]);
    await expect(
      values.setTaskValues({ ...caller, taskId: 't1', values: [{ definitionId: 'd1', value: bad }] }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    await values.setTaskValues({ ...caller, taskId: 't1', values: [{ definitionId: 'd1', value: good }] });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
