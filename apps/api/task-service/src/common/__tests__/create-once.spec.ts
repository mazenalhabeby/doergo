import { ConflictException } from '@nestjs/common';
import { createOnce } from '../create-once.util';

describe('createOnce', () => {
  const row = { id: 'c1', taskId: 't1', userId: 'u1' };

  it('creates normally without a client id', async () => {
    const create = jest.fn(async () => row);
    expect(await createOnce({ id: undefined, find: jest.fn(), isSame: () => true, create })).toEqual({ row, created: true });
  });

  it('returns the existing record for a resend, without creating', async () => {
    const create = jest.fn();
    const res = await createOnce({ id: 'c1', find: async () => row, isSame: (r) => r.userId === 'u1', create });
    expect(res).toEqual({ row, created: false });
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses an id that belongs to somebody else — never returns their record', async () => {
    await expect(createOnce({ id: 'c1', find: async () => row, isSame: (r) => r.userId === 'intruder', create: jest.fn() }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('settles a race between two sends of the same record', async () => {
    let stored: typeof row | null = null;
    const find = jest.fn(async () => stored);
    const create = jest.fn(async () => {
      stored = row; // the other send won
      throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    });
    expect(await createOnce({ id: 'c1', find, isSame: () => true, create })).toEqual({ row, created: false });
  });

  it('does not swallow other errors', async () => {
    await expect(createOnce({ id: 'c1', find: async () => null, isSame: () => true, create: async () => { throw new Error('db down'); } }))
      .rejects.toThrow('db down');
  });
});
