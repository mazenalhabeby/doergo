import { ArgumentsHost } from '@nestjs/common';
import { GlobalExceptionFilter } from '../http-exception.filter';

/**
 * The body parser's own refusals keep their 4xx. A 12 MB body answered 500 "unexpected error" (found by
 * tools/layer0-gateway-e2e.py): body-parser throws a plain Error carrying `status: 413, expose: true`, and the
 * filter only knew HttpExceptions and service replies. Its message is never forwarded — only the status.
 */
describe('GlobalExceptionFilter — the body parser', () => {
  const run = (exception: unknown) => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'POST', url: '/api/v1/auth/login' }),
      }),
    } as unknown as ArgumentsHost;
    new GlobalExceptionFilter().catch(exception, host);
    return { code: status.mock.calls[0][0], body: json.mock.calls[0][0] };
  };
  const parserError = (status: number, type: string, message: string) =>
    Object.assign(new Error(message), { status, statusCode: status, expose: true, type });

  it('a body over the limit is 413, said plainly', () => {
    const r = run(parserError(413, 'entity.too.large', 'request entity too large'));
    expect(r.code).toBe(413);
    expect(r.body.message).toBe('The request is too large.');
  });

  it('an unsupported charset is its own 4xx, with none of the library text', () => {
    const r = run(parserError(415, 'charset.unsupported', 'unsupported charset "UTF-7"'));
    expect(r.code).toBe(415);
    expect(JSON.stringify(r.body)).not.toContain('UTF-7');
  });

  it('an error not marked safe to tell stays a 500 with no detail', () => {
    const r = run(Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), { status: 400 }));
    expect(r.code).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('ECONNREFUSED');
  });
});
