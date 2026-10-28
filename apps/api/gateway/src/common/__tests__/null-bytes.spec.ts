import { hasNulByte, refuseNulBytes } from '../null-bytes';

/** A NUL character cannot be stored by Postgres — refused at the door as 400, never a 500 from the database. */
describe('refuseNulBytes', () => {
  const run = (url: string, body?: unknown) => {
    const json = jest.fn();
    const res = { status: jest.fn().mockReturnValue({ json }) } as any;
    const next = jest.fn();
    refuseNulBytes({ originalUrl: url, body } as any, res, next);
    return { refused: res.status.mock.calls[0]?.[0], next: next.mock.calls.length };
  };

  it('in the query string', () => expect(run('/api/v1/tasks?search=%00x').refused).toBe(400));
  it('deep in a JSON body', () =>
    expect(run('/api/v1/tasks', { a: [{ b: 'ok' }, { c: 'x\u0000y' }] }).refused).toBe(400));
  it('an ordinary request passes', () =>
    expect(run('/api/v1/tasks?search=Müller%20100%25', { title: 'Fix 0 boiler' }).next).toBe(1));
  it('a very deep body does not recurse forever', () => {
    let deep: any = 'x';
    for (let i = 0; i < 1000; i++) deep = { deep };
    expect(hasNulByte(deep)).toBe(false);
  });
});
