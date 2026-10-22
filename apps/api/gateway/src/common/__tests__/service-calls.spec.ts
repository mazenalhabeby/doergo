import { NEVER, of, throwError } from 'rxjs';
import { ServiceLine } from '../microservices/service-calls';

describe('ServiceLine — how a controller calls a service', () => {
  const contract = { cmd: 'probe' } as never;

  it("asks once with the contract's command and answers the reply", async () => {
    const client = { send: jest.fn(() => of({ ok: 1 })) };
    await expect(new ServiceLine(client as never).ask(contract, { a: 1 } as never)).resolves.toEqual({ ok: 1 });
    expect(client.send).toHaveBeenCalledTimes(1);
    expect(client.send).toHaveBeenCalledWith({ cmd: 'probe' }, { a: 1 });
  });

  it('passes a refusal through UNCHANGED, so the global filter maps it as it always did', async () => {
    const refusal = { statusCode: 403, message: 'No', code: 'X' };
    const client = { send: jest.fn(() => throwError(() => refusal)) };
    await expect(new ServiceLine(client as never).ask(contract, {} as never)).rejects.toBe(refusal);
  });

  it('a call that never answers becomes a 408 instead of holding the request for ever', async () => {
    const client = { send: jest.fn(() => NEVER) };
    await expect(new ServiceLine(client as never).ask(contract, {} as never, { timeoutMs: 20 })).rejects.toMatchObject({
      status: 408,
    });
  });
});
