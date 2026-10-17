import { readFileSync } from 'fs';
import { join } from 'path';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { assertExternalMayWriteTask } from '../external-task-write';
import { tasksControllerSource } from '../../modules/tasks/__tests__/tasks-controllers.fixture';

/**
 * An external member writes (comment, photo, field value) only on a job they
 * RAISED. The checklist already refuses them outright; these routes keep the
 * observer's one legitimate write — adding to their own report — and nothing else.
 */
describe('assertExternalMayWriteTask', () => {
  const ext = { user: { id: 'x1', isExternal: true, organizationId: 'o1', role: 'EMPLOYEE' }, method: 'POST' };
  const own = { success: true, data: { id: 't1', createdById: 'x1', attachments: [{ id: 'a1' }] } };
  const theirs = { success: true, data: { id: 't2', createdById: 'u9', attachments: [{ id: 'a2' }] } };

  it('an internal member passes without a lookup', async () => {
    const read = jest.fn();
    await assertExternalMayWriteTask({ user: { id: 'u1', isExternal: false } }, 't1', read);
    expect(read).not.toHaveBeenCalled();
  });

  it('an external member may write on a task they created', async () => {
    const read = jest.fn().mockResolvedValue(own);
    await expect(assertExternalMayWriteTask(ext, 't1', read)).resolves.toBeUndefined();
    // read through the normal task gate, as the caller
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', userId: 'x1', organizationId: 'o1' }));
  });

  it("is refused on somebody else's task", async () => {
    const read = jest.fn().mockResolvedValue(theirs);
    await expect(assertExternalMayWriteTask(ext, 't2', read)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cannot name their own task to delete an attachment on another', async () => {
    const read = jest.fn().mockResolvedValue(own);
    await expect(assertExternalMayWriteTask(ext, 't1', read, { attachmentId: 'a2' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(assertExternalMayWriteTask(ext, 't1', read, { attachmentId: 'a1' })).resolves.toBeUndefined();
  });

  it('a task the gate refuses stays refused', async () => {
    const read = jest.fn().mockRejectedValue(new NotFoundException());
    await expect(assertExternalMayWriteTask(ext, 't3', read)).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('every task comment / attachment / field-value write asks it', () => {
    const tasks = tasksControllerSource();
    const fields = readFileSync(join(__dirname, '..', '..', 'modules', 'custom-fields', 'custom-fields.controller.ts'), 'utf8');
    const routes = [
      ...[...tasks.matchAll(/@(Post|Delete)\(':id\/(?:comments|attachments)[^']*'\)[\s\S]*?async (\w+)\([\s\S]*?\{([\s\S]*?)\n {2}\}/g)],
      ...[...fields.matchAll(/@(Patch)\(':id\/custom-fields'\)[\s\S]*?async (\w+)\([\s\S]*?\{([\s\S]*?)\n {2}\}/g)],
    ];
    it('finds them', () => expect(routes.length).toBe(5));
    it.each(routes.map((m) => [m[2], m[3]] as const))('%s', (_n, body) => {
      expect(body).toMatch(/assertExternalMayWrite/);
    });
  });
});
